import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import mysql from 'mysql2/promise';

import { SuperAdminBootstrapRepositoryMysql } from '../../../src/repositories/bootstrap/super-admin-bootstrap.repository.mysql.js';
import { SuperAdminBootstrapService } from '../../../src/services/bootstrap/super-admin-bootstrap.service.js';
import { env } from '../../../src/utils/env.js';
import { HttpError } from '../../../src/utils/errors.js';

import type { Pool } from 'mysql2/promise';

const baseTestDatabaseName = process.env.TEST_DB_NAME?.trim() ?? '';
const mysqlEnabled = Boolean(baseTestDatabaseName);

function requireBootstrapTestDatabaseName(): string {
    if (!/^[a-zA-Z0-9_]+$/.test(baseTestDatabaseName))
        throw new Error('TEST_DB_NAME must contain only letters, numbers and underscores');
    if (!baseTestDatabaseName.toLowerCase().includes('test'))
        throw new Error('TEST_DB_NAME must contain "test"');
    if (baseTestDatabaseName === env.db.name)
        throw new Error('TEST_DB_NAME must be different from DB_NAME');

    const databaseName = `${baseTestDatabaseName}_bootstrap`;
    if (databaseName.length > 64)
        throw new Error('TEST_DB_NAME is too long for the bootstrap integration database suffix');
    return databaseName;
}

function targetDatabase(sql: string, databaseName: string): string {
    return sql.replace(/USE\s+recipe_shelter\s*;/i, `USE \`${databaseName}\`;`);
}

describe('SuperAdmin bootstrap MySQL integration', { skip: !mysqlEnabled && 'Set TEST_DB_NAME to run isolated MySQL tests' }, () => {
    let adminConnection: mysql.Connection;
    let pool: Pool;
    let seed: string;

    before(async () => {
        const databaseName = requireBootstrapTestDatabaseName();
        adminConnection = await mysql.createConnection({
            host: env.db.host,
            port: env.db.port,
            user: env.db.user,
            password: env.db.password,
            multipleStatements: true
        });

        await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
        await adminConnection.query(
            `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );

        const schemaPath = new URL('../../../database/migrations/1_create_schema.sql', import.meta.url);
        const seedPath = new URL('../../../database/seed.sql', import.meta.url);
        const schema = targetDatabase(await readFile(schemaPath, 'utf8'), databaseName);
        seed = targetDatabase(await readFile(seedPath, 'utf8'), databaseName);

        await adminConnection.query(schema);
        await adminConnection.query(seed);

        pool = mysql.createPool({
            host: env.db.host,
            port: env.db.port,
            user: env.db.user,
            password: env.db.password,
            database: databaseName,
            connectionLimit: 3,
            timezone: 'Z'
        });
    });

    after(async () => {
        if (pool)
            await pool.end();
        if (adminConnection) {
            await adminConnection.query(`DROP DATABASE IF EXISTS \`${requireBootstrapTestDatabaseName()}\``);
            await adminConnection.end();
        }
    });

    it('applies schema then seed and serializes creation of the only first SuperAdmin', async () => {
        const [initialAssignments] = await pool.query(
            `SELECT COUNT(*) AS AssignmentCount
             FROM StaffRoles AS sr
             INNER JOIN Roles AS r ON r.Id = sr.RoleId
             WHERE r.Code = 'SuperAdmin'`
        );
        assert.deepEqual(initialAssignments, [{ AssignmentCount: 0 }]);

        const [initialAccounts] = await pool.query(`SELECT COUNT(*) AS AccountCount FROM Users`);
        assert.deepEqual(initialAccounts, [{ AccountCount: 0 }]);

        const firstService = new SuperAdminBootstrapService(
            new SuperAdminBootstrapRepositoryMysql(pool),
            async () => 'first-password-hash'
        );
        const secondService = new SuperAdminBootstrapService(
            new SuperAdminBootstrapRepositoryMysql(pool),
            async () => 'second-password-hash'
        );
        const attempts = await Promise.allSettled([
            firstService.bootstrap({
                mail: 'first-bootstrap@test.local',
                username: 'first-bootstrap',
                password: 'StrongPass42!'
            }),
            secondService.bootstrap({
                mail: 'second-bootstrap@test.local',
                username: 'second-bootstrap',
                password: 'OtherStrongPass42!'
            })
        ]);

        assert.equal(attempts.filter(({ status }) => status === 'fulfilled').length, 1);
        const rejectedAttempt = attempts.find(({ status }) => status === 'rejected');
        assert.ok(rejectedAttempt?.status === 'rejected');
        assert.ok(rejectedAttempt.reason instanceof HttpError);
        assert.equal(rejectedAttempt.reason.code, 'BOOTSTRAP_SUPER_ADMIN_ACTIVE_EXISTS');

        const [createdAccounts] = await pool.query(
            `SELECT u.Id, u.Mail, u.Username, u.Password, u.AccountType, sp.Status, r.Code AS RoleCode
             FROM Users AS u
             INNER JOIN StaffProfiles AS sp ON sp.UserId = u.Id
             INNER JOIN StaffRoles AS sr ON sr.StaffUserId = u.Id
             INNER JOIN Roles AS r ON r.Id = sr.RoleId
             WHERE r.Code = 'SuperAdmin'`
        );
        assert.equal((createdAccounts as unknown[]).length, 1);
        const createdAccount = (createdAccounts as Array<{
            Id: number;
            Mail: string;
            Username: string;
            Password: string;
            AccountType: string;
            Status: string;
            RoleCode: string;
        }>)[0];
        assert.ok(createdAccount);
        assert.equal(createdAccount.Id, 1);
        assert.equal(['first-bootstrap@test.local', 'second-bootstrap@test.local'].includes(createdAccount.Mail), true);
        assert.equal(['first-bootstrap', 'second-bootstrap'].includes(createdAccount.Username), true);
        assert.equal(['first-password-hash', 'second-password-hash'].includes(createdAccount.Password), true);
        assert.notEqual(createdAccount.Password, 'StrongPass42!');
        assert.notEqual(createdAccount.Password, 'OtherStrongPass42!');
        assert.equal(createdAccount.AccountType, 'staff');
        assert.equal(createdAccount.Status, 'active');
        assert.equal(createdAccount.RoleCode, 'SuperAdmin');

        await adminConnection.query(seed);
        const [replayedAccountRows] = await pool.query(
            `SELECT u.Password, sp.Status,
                    (SELECT COUNT(*) FROM StaffRoles AS sr WHERE sr.StaffUserId = u.Id) AS RoleCount
             FROM Users AS u
             INNER JOIN StaffProfiles AS sp ON sp.UserId = u.Id
             WHERE u.Id = ?`,
            [createdAccount.Id]
        );
        assert.deepEqual(replayedAccountRows, [{
            Password: createdAccount.Password,
            Status: 'active',
            RoleCount: 1
        }]);

        await pool.query(`UPDATE StaffProfiles SET Status = 'disabled' WHERE UserId = ?`, [createdAccount.Id]);

        await assert.rejects(
            () => firstService.bootstrap({
                mail: 'replacement@test.local',
                username: 'replacement-admin',
                password: 'ReplacementPass42!'
            }),
            (error) => {
                assert.ok(error instanceof HttpError);
                assert.equal(error.code, 'BOOTSTRAP_SUPER_ADMIN_ALREADY_COMPLETED');
                return true;
            }
        );
    });
});
