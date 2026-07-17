import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import mysql from 'mysql2/promise';

import { SuperAdminBootstrapRepositoryMysql } from '../../../src/repositories/bootstrap/super-admin-bootstrap.repository.mysql.js';
import { SuperAdminBootstrapService } from '../../../src/services/bootstrap/super-admin-bootstrap.service.js';
import { env } from '../../../src/utils/env.js';
import { HttpError } from '../../../src/utils/errors.js';
import { hashStaffInvitationToken } from '../../../src/utils/security/staff-invitation-token.js';

import type { SuperAdminBootstrapInvitationMailInput } from '../../../src/services/mail/mail.types.js';
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

class CapturingBootstrapMailer {
    readonly messages: SuperAdminBootstrapInvitationMailInput[] = [];

    async sendSuperAdminBootstrapInvitationEmail(input: SuperAdminBootstrapInvitationMailInput): Promise<void> {
        this.messages.push(input);
    }
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

    it('applies schema then seed and serializes the only first SuperAdmin invitation', async () => {
        const [initialAssignments] = await pool.query(
            `SELECT COUNT(*) AS AssignmentCount
             FROM StaffRoles AS sr
             INNER JOIN Roles AS r ON r.Id = sr.RoleId
             WHERE r.Code = 'SuperAdmin'`
        );
        assert.deepEqual(initialAssignments, [{ AssignmentCount: 0 }]);

        const [initialAccounts] = await pool.query(`SELECT COUNT(*) AS AccountCount FROM Users`);
        assert.deepEqual(initialAccounts, [{ AccountCount: 0 }]);

        const failedDeliveryService = new SuperAdminBootstrapService(
            new SuperAdminBootstrapRepositoryMysql(pool),
            {
                async sendSuperAdminBootstrapInvitationEmail() {
                    throw new Error('SMTP unavailable');
                }
            },
            'https://front.example',
            { invitationTtlMinutes: 30, generateToken: () => 'failed-delivery-token' }
        );
        await assert.rejects(
            () => failedDeliveryService.bootstrap({
                mail: 'failed-delivery@test.local',
                username: 'failed-delivery'
            }),
            /SMTP unavailable/
        );
        const [cleanedAfterDeliveryFailure] = await pool.query(
            `SELECT
                (SELECT COUNT(*) FROM Users) AS UserCount,
                (SELECT COUNT(*) FROM StaffInvitations) AS InvitationCount,
                (SELECT COUNT(*) FROM StaffRoles) AS AssignmentCount`
        );
        assert.deepEqual(cleanedAfterDeliveryFailure, [{ UserCount: 0, InvitationCount: 0, AssignmentCount: 0 }]);

        const firstToken = 'first-bootstrap-raw-token';
        const secondToken = 'second-bootstrap-raw-token';
        const firstMailer = new CapturingBootstrapMailer();
        const secondMailer = new CapturingBootstrapMailer();
        const firstService = new SuperAdminBootstrapService(
            new SuperAdminBootstrapRepositoryMysql(pool),
            firstMailer,
            'https://front.example/',
            { invitationTtlMinutes: 30, generateToken: () => firstToken }
        );
        const secondService = new SuperAdminBootstrapService(
            new SuperAdminBootstrapRepositoryMysql(pool),
            secondMailer,
            'https://front.example/',
            { invitationTtlMinutes: 30, generateToken: () => secondToken }
        );
        const attempts = await Promise.allSettled([
            firstService.bootstrap({
                mail: 'first-bootstrap@test.local',
                username: 'first-bootstrap'
            }),
            secondService.bootstrap({
                mail: 'second-bootstrap@test.local',
                username: 'second-bootstrap'
            })
        ]);

        assert.equal(attempts.filter(({ status }) => status === 'fulfilled').length, 1);
        const rejectedAttempt = attempts.find(({ status }) => status === 'rejected');
        assert.ok(rejectedAttempt?.status === 'rejected');
        assert.ok(rejectedAttempt.reason instanceof HttpError);
        assert.equal(rejectedAttempt.reason.code, 'BOOTSTRAP_SUPER_ADMIN_ALREADY_COMPLETED');

        const deliveredMessages = [...firstMailer.messages, ...secondMailer.messages];
        assert.equal(deliveredMessages.length, 1);
        const deliveredMessage = deliveredMessages[0];
        assert.ok(deliveredMessage);
        const deliveredToken = new URL(deliveredMessage.invitationUrl).searchParams.get('token');
        assert.ok(deliveredToken === firstToken || deliveredToken === secondToken);
        assert.equal(deliveredMessage.expiresInMinutes, 30);

        const [createdAccounts] = await pool.query(
            `SELECT u.Id, u.Mail, u.Username, u.Password, u.AccountType, u.EmailValidatedAt,
                    sp.Status, r.Code AS RoleCode
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
            Password: string | null;
            AccountType: string;
            EmailValidatedAt: Date | null;
            Status: string;
            RoleCode: string;
        }>)[0];
        assert.ok(createdAccount);
        assert.equal(createdAccount.Mail, deliveredMessage.to);
        assert.equal(createdAccount.Username, deliveredMessage.username);
        assert.equal(createdAccount.Password, null);
        assert.equal(createdAccount.AccountType, 'staff');
        assert.equal(createdAccount.EmailValidatedAt, null);
        assert.equal(createdAccount.Status, 'invited');
        assert.equal(createdAccount.RoleCode, 'SuperAdmin');

        const [passwordColumns] = await pool.query(`SHOW COLUMNS FROM Users WHERE Field = 'Password'`);
        assert.equal((passwordColumns as Array<{ Null: string }>)[0]?.Null, 'YES');

        const [invitationRows] = await pool.query(
            `SELECT StaffUserId, TokenHash, ExpiresAt, UsedAt, RequiresMfa,
                    TIMESTAMPDIFF(SECOND, CURRENT_TIMESTAMP, ExpiresAt) AS RemainingTtlSeconds
             FROM StaffInvitations
             WHERE StaffUserId = ?`,
            [createdAccount.Id]
        );
        const invitation = (invitationRows as Array<{
            StaffUserId: number;
            TokenHash: string;
            ExpiresAt: Date;
            UsedAt: Date | null;
            RequiresMfa: number;
            RemainingTtlSeconds: number;
        }>)[0];
        assert.ok(invitation);
        assert.equal(invitation.StaffUserId, createdAccount.Id);
        assert.equal(invitation.TokenHash, hashStaffInvitationToken(deliveredToken));
        assert.notEqual(invitation.TokenHash, deliveredToken);
        assert.equal(invitation.UsedAt, null);
        assert.equal(invitation.RequiresMfa, 1);
        assert.ok(invitation.RemainingTtlSeconds > 25 * 60 && invitation.RemainingTtlSeconds <= 30 * 60);

        await assert.rejects(
            () => pool.query(`UPDATE StaffInvitations SET RequiresMfa = FALSE WHERE StaffUserId = ?`, [createdAccount.Id])
        );

        await adminConnection.query(seed);
        const [replayedAccountRows] = await pool.query(
            `SELECT u.Password, sp.Status,
                    (SELECT COUNT(*) FROM StaffRoles AS sr WHERE sr.StaffUserId = u.Id) AS RoleCount,
                    (SELECT COUNT(*) FROM StaffInvitations AS si WHERE si.StaffUserId = u.Id) AS InvitationCount
             FROM Users AS u
             INNER JOIN StaffProfiles AS sp ON sp.UserId = u.Id
             WHERE u.Id = ?`,
            [createdAccount.Id]
        );
        assert.deepEqual(replayedAccountRows, [{
            Password: null,
            Status: 'invited',
            RoleCount: 1,
            InvitationCount: 1
        }]);

        const [stillInvitedRows] = await pool.query(`SELECT Status FROM StaffProfiles WHERE UserId = ?`, [createdAccount.Id]);
        assert.deepEqual(stillInvitedRows, [{ Status: 'invited' }]);

        await pool.query(
            `INSERT INTO StaffWebAuthnCredentials
               (CredentialId, StaffUserId, PublicKey, SignatureCounter, DeviceType, BackedUp, Aaguid)
             VALUES ('bootstrap-credential', ?, 0x0102, 0, 'singleDevice', FALSE,
                     '00000000-0000-0000-0000-000000000000')`,
            [createdAccount.Id]
        );
        await pool.query(`UPDATE StaffProfiles SET MfaEnrolledAt = CURRENT_TIMESTAMP WHERE UserId = ?`, [createdAccount.Id]);
        await pool.query(`UPDATE Users SET Password = 'password-hash', Status = 'active' WHERE Id = ?`, [createdAccount.Id]);
        await pool.query(`UPDATE StaffInvitations SET UsedAt = CURRENT_TIMESTAMP WHERE StaffUserId = ?`, [createdAccount.Id]);
        await assert.rejects(
            () => firstService.bootstrap({
                mail: 'second-active@test.local',
                username: 'second-active-admin'
            }),
            (error) => {
                assert.ok(error instanceof HttpError);
                assert.equal(error.code, 'SUPER_ADMIN_ALREADY_EXISTS');
                assert.equal(error.statusCode, 409);
                return true;
            }
        );
        const [accountsAfterActiveRetry] = await pool.query(
            `SELECT
                (SELECT COUNT(*) FROM Users) AS UserCount,
                (SELECT COUNT(*)
                 FROM StaffRoles AS sr
                 INNER JOIN Roles AS r ON r.Id = sr.RoleId
                 WHERE r.Code = 'SuperAdmin') AS SuperAdminCount`
        );
        assert.deepEqual(accountsAfterActiveRetry, [{ UserCount: 1, SuperAdminCount: 1 }]);
        assert.equal(firstMailer.messages.length + secondMailer.messages.length, 1);

        await pool.query(
            `UPDATE StaffProfiles
             SET Status = 'disabled',
                 DisabledByStaffUserId = ?,
                 DisabledReason = 'Bootstrap remains closed after staff disablement',
                 DisabledAt = CURRENT_TIMESTAMP
             WHERE UserId = ?`,
            [createdAccount.Id, createdAccount.Id]
        );
        await assert.rejects(
            () => firstService.bootstrap({
                mail: 'replacement@test.local',
                username: 'replacement-admin'
            }),
            (error) => {
                assert.ok(error instanceof HttpError);
                assert.equal(error.code, 'BOOTSTRAP_SUPER_ADMIN_ALREADY_COMPLETED');
                return true;
            }
        );
    });
});
