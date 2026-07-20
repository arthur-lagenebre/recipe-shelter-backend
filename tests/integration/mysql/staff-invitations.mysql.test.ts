import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import mysql from 'mysql2/promise';

import { AdminAuditRepositoryMysql } from '../../../src/repositories/admin/admin.audit.repository.mysql.js';
import { StaffInvitationRepositoryMysql } from '../../../src/repositories/admin/admin.staff-invitation.repository.mysql.js';
import { AdminAuditActionRunnerMysql } from '../../../src/services/admin/admin.audit-action.runner.js';
import { AdminAuditService } from '../../../src/services/admin/admin.audit.service.js';
import { StaffInvitationService } from '../../../src/services/admin/admin.staff-invitation.service.js';
import { env } from '../../../src/utils/env.js';
import { HttpError } from '../../../src/utils/errors.js';
import { hashStaffInvitationToken } from '../../../src/utils/security/staff-invitation-token.js';

import type { StaffInvitationMailInput } from '../../../src/services/mail/mail.types.js';

const baseTestDatabaseName = process.env.TEST_DB_NAME?.trim() ?? '';
const mysqlEnabled = Boolean(baseTestDatabaseName);

function requireStaffInvitationsTestDatabaseName(): string {
    if (!/^[a-zA-Z0-9_]+$/.test(baseTestDatabaseName)) throw new Error('TEST_DB_NAME must contain only letters, numbers and underscores');
    if (!baseTestDatabaseName.toLowerCase().includes('test')) throw new Error('TEST_DB_NAME must contain "test"');
    if (baseTestDatabaseName === env.db.name) throw new Error('TEST_DB_NAME must be different from DB_NAME');

    const databaseName = `${baseTestDatabaseName}_staff_invites`;
    if (databaseName.length > 64) throw new Error('TEST_DB_NAME is too long for the staff invitation integration database suffix');
    return databaseName;
}

function targetDatabase(sql: string, databaseName: string): string {
    return sql.replace(/USE\s+recipe_shelter\s*;/i, `USE \`${databaseName}\`;`);
}

describe('staff invitation MySQL integration', { skip: !mysqlEnabled && 'Set TEST_DB_NAME to run isolated MySQL tests' }, () => {
    let adminConnection: mysql.Connection;
    let pool: mysql.Pool;
    let actorUserId: number;
    let messages: StaffInvitationMailInput[];
    let service: StaffInvitationService;

    before(async () => {
        const databaseName = requireStaffInvitationsTestDatabaseName();
        adminConnection = await mysql.createConnection({
            host: env.db.host,
            port: env.db.port,
            user: env.db.user,
            password: env.db.password,
            multipleStatements: true
        });

        await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
        await adminConnection.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

        const schemaPath = new URL('../../../database/migrations/1_create_schema.sql', import.meta.url);
        const seedPath = new URL('../../../database/seed.sql', import.meta.url);
        const schema = targetDatabase(await readFile(schemaPath, 'utf8'), databaseName);
        const seed = targetDatabase(await readFile(seedPath, 'utf8'), databaseName);

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

        const [actorResult] = await pool.execute<mysql.ResultSetHeader>(
            `INSERT INTO Users (Mail, Username, Password, AccountType, Status, EmailValidatedAt)
       VALUES ('actor@test.local', 'Staff Actor', 'password-hash', 'staff', 'inactive', CURRENT_TIMESTAMP)`
        );
        actorUserId = Number(actorResult.insertId);
        await pool.execute(
            `INSERT INTO StaffRoles (StaffUserId, RoleId)
       SELECT ?, Id FROM Roles WHERE Code = 'SuperAdmin'`,
            [actorUserId]
        );
        await pool.execute(
            `INSERT INTO StaffWebAuthnCredentials
         (CredentialId, StaffUserId, PublicKey, SignatureCounter, DeviceType, BackedUp, Aaguid)
       VALUES ('staff-invitation-actor-credential', ?, 0x0102, 0, 'singleDevice', FALSE,
               '00000000-0000-0000-0000-000000000000')`,
            [actorUserId]
        );
        await pool.execute(`UPDATE StaffProfiles SET MfaEnrolledAt = CURRENT_TIMESTAMP WHERE UserId = ?`, [actorUserId]);
        await pool.execute(`UPDATE Users SET Status = 'active' WHERE Id = ?`, [actorUserId]);

        const auditActions = new AdminAuditActionRunnerMysql(
            pool,
            (db) => new AdminAuditService(new AdminAuditRepositoryMysql(db), () => '00000000-0000-4000-8000-000000000551')
        );
        messages = [];
        service = new StaffInvitationService(
            new StaffInvitationRepositoryMysql(pool),
            {
                async sendStaffInvitationEmail(input) {
                    messages.push(input);
                }
            },
            auditActions,
            'https://front.example',
            { invitationTtlMinutes: 1440, generateToken: () => 'mysql-raw-invitation-token' }
        );
    });

    after(async () => {
        if (pool) await pool.end();
        if (adminConnection) {
            await adminConnection.query(`DROP DATABASE IF EXISTS \`${requireStaffInvitationsTestDatabaseName()}\``);
            await adminConnection.end();
        }
    });

    it('applies the final schema then central seed and creates one expiring audited invitation', async () => {
        const [permissionRows] = await pool.query(
            `SELECT p.Code
       FROM RolePermissions AS rp
       INNER JOIN Roles AS r ON r.Id = rp.RoleId
       INNER JOIN Permissions AS p ON p.Id = rp.PermissionId
       WHERE r.Code = 'SuperAdmin' AND p.Code = 'staff.create'`
        );
        assert.deepEqual(permissionRows, [{ Code: 'staff.create' }]);

        const invitation = await service.create(
            {
                email: 'new.staff@test.local',
                displayName: 'New Staff',
                roles: ['RecipeModerator', 'CommentModerator']
            },
            actorUserId,
            {
                ipAddress: '192.0.2.51',
                userAgent: 'Recipe Shelter MySQL integration'
            }
        );

        assert.equal(messages.length, 1);
        assert.equal(new URL(messages[0]!.invitationUrl).searchParams.get('token'), 'mysql-raw-invitation-token');

        const [rows] = await pool.query(
            `SELECT u.Id AS StaffUserId, u.Mail, u.Username, u.Password, u.AccountType,
              sp.Status, si.Id AS InvitationId, si.CreatedByStaffUserId, si.TokenHash,
              si.UsedAt, si.RequiresMfa,
              TIMESTAMPDIFF(SECOND, si.CreatedAt, si.ExpiresAt) AS TtlSeconds,
              GROUP_CONCAT(r.Code ORDER BY r.Code) AS RoleCodes
       FROM Users AS u
       INNER JOIN StaffProfiles AS sp ON sp.UserId = u.Id
       INNER JOIN StaffInvitations AS si ON si.StaffUserId = u.Id
       INNER JOIN StaffRoles AS sr ON sr.StaffUserId = u.Id
       INNER JOIN Roles AS r ON r.Id = sr.RoleId
       WHERE u.Id = ?
       GROUP BY u.Id, u.Mail, u.Username, u.Password, u.AccountType, sp.Status,
                si.Id, si.CreatedByStaffUserId, si.TokenHash, si.UsedAt, si.RequiresMfa,
                si.CreatedAt, si.ExpiresAt`,
            [invitation.staffUserId]
        );
        assert.deepEqual(rows, [
            {
                StaffUserId: invitation.staffUserId,
                Mail: 'new.staff@test.local',
                Username: 'New Staff',
                Password: null,
                AccountType: 'staff',
                Status: 'invited',
                InvitationId: invitation.id,
                CreatedByStaffUserId: actorUserId,
                TokenHash: hashStaffInvitationToken('mysql-raw-invitation-token'),
                UsedAt: null,
                RequiresMfa: 1,
                TtlSeconds: 1440 * 60,
                RoleCodes: 'CommentModerator,RecipeModerator'
            }
        ]);

        const [auditRows] = await pool.query(
            `SELECT ActorUserId, Action, TargetType, TargetId, AfterValues,
              IpAddress, UserAgent, CorrelationId
       FROM AdminAuditLogs
       WHERE Action = 'staff.invitations.create'`
        );
        assert.equal((auditRows as unknown[]).length, 1);
        const audit = (auditRows as Array<Record<string, unknown>>)[0]!;
        assert.equal(audit.ActorUserId, actorUserId);
        assert.equal(audit.TargetType, 'staff_invitation');
        assert.equal(audit.TargetId, String(invitation.id));
        assert.equal(audit.IpAddress, '192.0.2.51');
        assert.equal(audit.UserAgent, 'Recipe Shelter MySQL integration');
        assert.equal(audit.CorrelationId, '00000000-0000-4000-8000-000000000551');
        assert.equal(JSON.stringify(audit.AfterValues).includes('new.staff@test.local'), false);
        assert.equal(JSON.stringify(audit.AfterValues).includes('mysql-raw-invitation-token'), false);

        await assert.rejects(() => pool.query(`UPDATE StaffInvitations SET ExpiresAt = CreatedAt WHERE Id = ?`, [invitation.id]));
        await assert.rejects(() =>
            pool.query(`UPDATE StaffInvitations SET UsedAt = DATE_SUB(CreatedAt, INTERVAL 1 SECOND) WHERE Id = ?`, [invitation.id])
        );
    });

    it('distinguishes existing invitations and existing account emails', async () => {
        await assert.rejects(
            () =>
                service.create(
                    {
                        email: 'new.staff@test.local',
                        displayName: 'Other Staff',
                        roles: ['UserAdmin']
                    },
                    actorUserId,
                    {}
                ),
            (error) => assertHttpError(error, 'STAFF_INVITATION_ALREADY_EXISTS')
        );

        await pool.execute(
            `INSERT INTO Users (Mail, Username, Password, AccountType, Status)
       VALUES ('community@test.local', 'Community Member', 'password-hash', 'community', 'active')`
        );
        await assert.rejects(
            () =>
                service.create(
                    {
                        email: 'community@test.local',
                        displayName: 'Another Staff',
                        roles: ['UserAdmin']
                    },
                    actorUserId,
                    {}
                ),
            (error) => assertHttpError(error, 'STAFF_EMAIL_ALREADY_EXISTS')
        );
    });

    it('rolls back the identity, roles, invitation and audit when email delivery fails', async () => {
        const failingService = new StaffInvitationService(
            new StaffInvitationRepositoryMysql(pool),
            {
                async sendStaffInvitationEmail() {
                    throw new Error('SMTP unavailable');
                }
            },
            new AdminAuditActionRunnerMysql(pool, (db) => new AdminAuditService(new AdminAuditRepositoryMysql(db))),
            'https://front.example',
            { invitationTtlMinutes: 60, generateToken: () => 'failed-delivery-token' }
        );

        await assert.rejects(
            () =>
                failingService.create(
                    {
                        email: 'failed.delivery@test.local',
                        displayName: 'Failed Delivery',
                        roles: ['UserAdmin']
                    },
                    actorUserId,
                    {}
                ),
            /SMTP unavailable/
        );
        const [counts] = await pool.query(
            `SELECT
         (SELECT COUNT(*) FROM Users WHERE Mail = 'failed.delivery@test.local') AS UserCount,
         (SELECT COUNT(*)
          FROM AdminAuditLogs
          WHERE Action = 'staff.invitations.create'
            AND JSON_UNQUOTE(JSON_EXTRACT(AfterValues, '$.displayName')) = 'Failed Delivery') AS AuditCount`
        );
        assert.deepEqual(counts, [{ UserCount: 0, AuditCount: 0 }]);
    });
});

function assertHttpError(error: unknown, code: string): boolean {
    assert.ok(error instanceof HttpError);
    assert.equal(error.statusCode, 409);
    assert.equal(error.code, code);
    return true;
}
