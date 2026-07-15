import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import mysql from 'mysql2/promise';

import { env } from '../../../src/utils/env.js';

const baseTestDatabaseName = process.env.TEST_DB_NAME?.trim() ?? '';
const mysqlEnabled = Boolean(baseTestDatabaseName);

function requireRbacTestDatabaseName(): string {
    if (!/^[a-zA-Z0-9_]+$/.test(baseTestDatabaseName))
        throw new Error('TEST_DB_NAME must contain only letters, numbers and underscores');
    if (!baseTestDatabaseName.toLowerCase().includes('test'))
        throw new Error('TEST_DB_NAME must contain "test"');
    if (baseTestDatabaseName === env.db.name)
        throw new Error('TEST_DB_NAME must be different from DB_NAME');

    const databaseName = `${baseTestDatabaseName}_rbac`;
    if (databaseName.length > 64)
        throw new Error('TEST_DB_NAME is too long for the RBAC integration database suffix');
    return databaseName;
}

function targetDatabase(sql: string, databaseName: string): string {
    return sql.replace(/USE\s+recipe_shelter\s*;/i, `USE \`${databaseName}\`;`);
}

describe('RBAC schema and seed integration', { skip: !mysqlEnabled && 'Set TEST_DB_NAME to run isolated MySQL tests' }, () => {
    let connection: mysql.Connection;

    before(async () => {
        const databaseName = requireRbacTestDatabaseName();
        connection = await mysql.createConnection({
            host: env.db.host,
            port: env.db.port,
            user: env.db.user,
            password: env.db.password,
            multipleStatements: true
        });

        await connection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
        await connection.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

        const schemaPath = new URL('../../../database/migrations/1_create_schema.sql', import.meta.url);
        const seedPath = new URL('../../../database/seed.sql', import.meta.url);
        const schema = targetDatabase(await readFile(schemaPath, 'utf8'), databaseName);
        const seed = targetDatabase(await readFile(seedPath, 'utf8'), databaseName);

        await connection.query(schema);
        await connection.query(seed);
    });

    after(async () => {
        if (connection) {
            await connection.query(`DROP DATABASE IF EXISTS \`${requireRbacTestDatabaseName()}\``);
            await connection.end();
        }
    });

    it('bootstraps the final RBAC model from an empty database', async () => {
        const databaseName = requireRbacTestDatabaseName();
        const [tables] = await connection.query(
            `SELECT TABLE_NAME AS TableName
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ?
               AND TABLE_NAME IN ('Roles', 'Permissions', 'StaffRoles', 'RolePermissions')
             ORDER BY TABLE_NAME`,
            [databaseName]
        );
        assert.deepEqual(
            (tables as Array<{ TableName: string }>).map((row) => row.TableName.toLowerCase()),
            ['permissions', 'rolepermissions', 'roles', 'staffroles']
        );

        const [legacyRoleColumns] = await connection.query(`SHOW COLUMNS FROM Users WHERE Field = 'RoleId'`);
        assert.deepEqual(legacyRoleColumns, []);

        const [adminRoles] = await connection.query(`SELECT RoleId FROM StaffRoles WHERE StaffUserId = 1 ORDER BY RoleId`);
        assert.deepEqual(adminRoles, [{ RoleId: 1 }, { RoleId: 2 }]);

        const [adminPermissions] = await connection.query(
            `SELECT DISTINCT p.Code
             FROM StaffRoles AS sr
             INNER JOIN RolePermissions AS rp ON rp.RoleId = sr.RoleId
             INNER JOIN Permissions AS p ON p.Id = rp.PermissionId
             WHERE sr.StaffUserId = 1
             ORDER BY p.Code`
        );
        assert.equal((adminPermissions as Array<{ Code: string }>).length, 11);

        const [anonymousPermissions] = await connection.query(
            `SELECT COUNT(*) AS PermissionCount
             FROM StaffRoles AS sr
             INNER JOIN RolePermissions AS rp ON rp.RoleId = sr.RoleId
             WHERE sr.StaffUserId = 2`
        );
        assert.deepEqual(anonymousPermissions, [{ PermissionCount: 0 }]);
    });

    it('enforces unique assignments, foreign keys and default deny', async () => {
        await connection.query(
            `INSERT INTO Users (Id, Mail, Username, Password, AccountType, Status) VALUES
                (100, 'community-rbac@test.local', 'community-rbac', 'hash', 'community', 'active'),
                (101, 'staff-rbac@test.local', 'staff-rbac', 'hash', 'staff', 'active')`
        );

        const [defaultRoles] = await connection.query(`SELECT RoleId FROM StaffRoles WHERE StaffUserId = 101`);
        assert.deepEqual(defaultRoles, []);

        await connection.query(`INSERT INTO StaffRoles (StaffUserId, RoleId) VALUES (101, 1), (101, 2)`);
        const [staffRoles] = await connection.query(`SELECT RoleId FROM StaffRoles WHERE StaffUserId = 101 ORDER BY RoleId`);
        assert.deepEqual(staffRoles, [{ RoleId: 1 }, { RoleId: 2 }]);

        await assert.rejects(() => connection.query(`INSERT INTO StaffRoles (StaffUserId, RoleId) VALUES (101, 1)`));
        await assert.rejects(() => connection.query(`INSERT INTO StaffRoles (StaffUserId, RoleId) VALUES (100, 1)`));
        await assert.rejects(() => connection.query(`INSERT INTO StaffRoles (StaffUserId, RoleId) VALUES (101, 999999)`));
        await assert.rejects(() => connection.query(`INSERT INTO RolePermissions (RoleId, PermissionId) VALUES (1, 1)`));
        await assert.rejects(() => connection.query(`INSERT INTO RolePermissions (RoleId, PermissionId) VALUES (1, 999999)`));
        await assert.rejects(() => connection.query(`INSERT INTO Roles (Name, Description) VALUES ('ADMINISTRATOR', 'Duplicate')`));
        await assert.rejects(() => connection.query(`INSERT INTO Permissions (Code, Description) VALUES ('USERS.READ', 'Duplicate')`));
    });
});
