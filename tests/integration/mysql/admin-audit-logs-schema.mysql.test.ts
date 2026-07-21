import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import mysql from 'mysql2/promise';

import { AdminUserRepositoryMysql } from '../../../src/repositories/admin/admin.users.repository.mysql.js';
import { AdminAuditQueryRepositoryMysql } from '../../../src/repositories/admin/admin.audit-query.repository.mysql.js';
import { AdminAuditRepositoryMysql } from '../../../src/repositories/admin/admin.audit.repository.mysql.js';
import { UserRepositoryMysql } from '../../../src/repositories/users/user.repository.mysql.js';
import { AdminAuditActionRunnerMysql } from '../../../src/services/admin/admin.audit-action.runner.js';
import { ADMIN_AUDIT_EVENT_TYPES, ADMIN_AUDIT_TARGET_TYPES } from '../../../src/services/admin/admin.audit.events.js';
import { AdminAuditService } from '../../../src/services/admin/admin.audit.service.js';
import { AdminUserService } from '../../../src/services/admin/admin.users.service.js';
import { env } from '../../../src/utils/env.js';

import type { Queryable } from '../../../src/db/query.js';

const baseTestDatabaseName = process.env.TEST_DB_NAME?.trim() ?? '';
const mysqlEnabled = Boolean(baseTestDatabaseName);

function requireAuditTestDatabaseName(): string {
    if (!/^[a-zA-Z0-9_]+$/.test(baseTestDatabaseName))
        throw new Error('TEST_DB_NAME must contain only letters, numbers and underscores');
    if (!baseTestDatabaseName.toLowerCase().includes('test'))
        throw new Error('TEST_DB_NAME must contain "test"');
    if (baseTestDatabaseName === env.db.name)
        throw new Error('TEST_DB_NAME must be different from DB_NAME');

    const databaseName = `${baseTestDatabaseName}_audit`;
    if (databaseName.length > 64)
        throw new Error('TEST_DB_NAME is too long for the audit integration database suffix');
    return databaseName;
}

function targetDatabase(sql: string, databaseName: string): string {
    return sql.replace(/USE\s+recipe_shelter\s*;/i, `USE \`${databaseName}\`;`);
}

function assertImmutableAuditError(error: unknown, operation: 'DELETE' | 'UPDATE'): boolean {
    assert.ok(error instanceof Error);

    const mysqlError = error as Error & {
        errno?: number;
        sqlMessage?: string;
        sqlState?: string;
    };

    assert.equal(mysqlError.errno, 1644);
    assert.equal(mysqlError.sqlState, '45000');
    assert.equal(mysqlError.sqlMessage, `Admin audit logs are append-only: ${operation} is forbidden`);
    return true;
}

class FailingModerationLogAdminUserRepository extends AdminUserRepositoryMysql {
    override async createModerationLog(): Promise<void> {
        throw new Error('forced specialized moderation log failure');
    }
}

describe('admin audit logs schema integration', { skip: !mysqlEnabled && 'Set TEST_DB_NAME to run isolated MySQL tests' }, () => {
    let connection: mysql.Connection;
    let pool: mysql.Pool;

    before(async () => {
        const databaseName = requireAuditTestDatabaseName();
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
        await connection.query(`INSERT INTO Users (Id, Mail, Username, Password, AccountType, Status) VALUES (900, 'audit-staff@test.local', 'audit-staff', 'non-secret-test-hash', 'staff', 'inactive'), (901, 'audit-community@test.local', 'audit-community', 'non-secret-test-hash', 'community', 'active')`);
        pool = mysql.createPool({
            host: env.db.host,
            port: env.db.port,
            user: env.db.user,
            password: env.db.password,
            database: databaseName,
            connectionLimit: 2
        });
    });

    after(async () => {
        if (pool)
            await pool.end();
        if (connection) {
            await connection.query(`DROP DATABASE IF EXISTS \`${requireAuditTestDatabaseName()}\``);
            await connection.end();
        }
    });

    it('creates the complete investigation model from an empty database and the central seed', async () => {
        const databaseName = requireAuditTestDatabaseName();
        const [columns] = await connection.query(`SELECT COLUMN_NAME AS ColumnName, DATA_TYPE AS DataType, IS_NULLABLE AS IsNullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'AdminAuditLogs' ORDER BY ORDINAL_POSITION`, [databaseName]);

        assert.deepEqual(columns, [
            { ColumnName: 'Id', DataType: 'bigint', IsNullable: 'NO' },
            { ColumnName: 'ActorUserId', DataType: 'bigint', IsNullable: 'NO' },
            { ColumnName: 'Action', DataType: 'varchar', IsNullable: 'NO' },
            { ColumnName: 'TargetType', DataType: 'varchar', IsNullable: 'NO' },
            { ColumnName: 'TargetId', DataType: 'varchar', IsNullable: 'NO' },
            { ColumnName: 'Reason', DataType: 'text', IsNullable: 'YES' },
            { ColumnName: 'BeforeValues', DataType: 'json', IsNullable: 'YES' },
            { ColumnName: 'AfterValues', DataType: 'json', IsNullable: 'YES' },
            { ColumnName: 'IpAddress', DataType: 'varchar', IsNullable: 'YES' },
            { ColumnName: 'UserAgent', DataType: 'varchar', IsNullable: 'YES' },
            { ColumnName: 'CorrelationId', DataType: 'char', IsNullable: 'NO' },
            { ColumnName: 'CreatedAt', DataType: 'datetime', IsNullable: 'NO' }
        ]);

        const [indexes] = await connection.query(`SELECT DISTINCT INDEX_NAME AS IndexName FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'AdminAuditLogs' ORDER BY INDEX_NAME`, [databaseName]);
        assert.deepEqual(
            (indexes as Array<{ IndexName: string }>).map(({ IndexName }) => IndexName),
            [
                'idx_admin_audit_logs_action_created_at',
                'idx_admin_audit_logs_actor_created_at',
                'idx_admin_audit_logs_correlation_id',
                'idx_admin_audit_logs_created_at',
                'idx_admin_audit_logs_target_created_at',
                'PRIMARY'
            ]
        );

        const [indexColumns] = await connection.query(`SELECT INDEX_NAME AS IndexName, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS ColumnNames FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'AdminAuditLogs' GROUP BY INDEX_NAME ORDER BY INDEX_NAME`, [databaseName]);
        assert.deepEqual(indexColumns, [
            { IndexName: 'idx_admin_audit_logs_action_created_at', ColumnNames: 'Action,CreatedAt,Id' },
            { IndexName: 'idx_admin_audit_logs_actor_created_at', ColumnNames: 'ActorUserId,CreatedAt,Id' },
            { IndexName: 'idx_admin_audit_logs_correlation_id', ColumnNames: 'CorrelationId,CreatedAt,Id' },
            { IndexName: 'idx_admin_audit_logs_created_at', ColumnNames: 'CreatedAt,Id' },
            { IndexName: 'idx_admin_audit_logs_target_created_at', ColumnNames: 'TargetType,TargetId,CreatedAt,Id' },
            { IndexName: 'PRIMARY', ColumnNames: 'Id' }
        ]);

        const [immutabilityTriggers] = await connection.query(`SELECT TRIGGER_NAME AS TriggerName, ACTION_TIMING AS ActionTiming, EVENT_MANIPULATION AS EventManipulation FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ? AND EVENT_OBJECT_TABLE = 'AdminAuditLogs' ORDER BY TRIGGER_NAME`, [databaseName]);
        assert.deepEqual(immutabilityTriggers, [
            {
                TriggerName: 'admin_audit_logs_immutable_BD',
                ActionTiming: 'BEFORE',
                EventManipulation: 'DELETE'
            },
            {
                TriggerName: 'admin_audit_logs_immutable_BU',
                ActionTiming: 'BEFORE',
                EventManipulation: 'UPDATE'
            }
        ]);

        const [seededLogs] = await connection.query('SELECT COUNT(*) AS LogCount FROM AdminAuditLogs');
        assert.deepEqual(seededLogs, [{ LogCount: 0 }]);

        const [moderationColumns] = await connection.query(`SELECT LOWER(TABLE_NAME) AS TableName, GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION SEPARATOR ',') AS ColumnNames FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('CommentModerationLogs', 'RecipeModerationLogs', 'StaffModerationLogs', 'UserModerationLogs') GROUP BY TABLE_NAME ORDER BY TABLE_NAME`, [databaseName]);
        assert.deepEqual(moderationColumns, [
            { TableName: 'commentmoderationlogs', ColumnNames: 'AdminAuditLogId,CommentId' },
            { TableName: 'recipemoderationlogs', ColumnNames: 'AdminAuditLogId,RecipeId' },
            { TableName: 'staffmoderationlogs', ColumnNames: 'AdminAuditLogId,StaffUserId' },
            { TableName: 'usermoderationlogs', ColumnNames: 'AdminAuditLogId,UserId' }
        ]);

        const [moderationAuditForeignKeys] = await connection.query(`SELECT LOWER(TABLE_NAME) AS TableName, COLUMN_NAME AS ColumnName, LOWER(REFERENCED_TABLE_NAME) AS ReferencedTableName, REFERENCED_COLUMN_NAME AS ReferencedColumnName FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_NAME LIKE '%moderation_logs_audit_log_FK' ORDER BY TABLE_NAME`, [databaseName]);
        assert.deepEqual(moderationAuditForeignKeys, [
            {
                TableName: 'commentmoderationlogs',
                ColumnName: 'AdminAuditLogId',
                ReferencedTableName: 'adminauditlogs',
                ReferencedColumnName: 'Id'
            },
            {
                TableName: 'recipemoderationlogs',
                ColumnName: 'AdminAuditLogId',
                ReferencedTableName: 'adminauditlogs',
                ReferencedColumnName: 'Id'
            },
            {
                TableName: 'staffmoderationlogs',
                ColumnName: 'AdminAuditLogId',
                ReferencedTableName: 'adminauditlogs',
                ReferencedColumnName: 'Id'
            },
            {
                TableName: 'usermoderationlogs',
                ColumnName: 'AdminAuditLogId',
                ReferencedTableName: 'adminauditlogs',
                ReferencedColumnName: 'Id'
            }
        ]);

        const [moderationTriggers] = await connection.query(`SELECT LOWER(EVENT_OBJECT_TABLE) AS TableName, EVENT_MANIPULATION AS EventManipulation FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ? AND EVENT_OBJECT_TABLE IN ('CommentModerationLogs', 'RecipeModerationLogs', 'StaffModerationLogs', 'UserModerationLogs') ORDER BY LOWER(EVENT_OBJECT_TABLE), FIELD(EVENT_MANIPULATION, 'DELETE', 'UPDATE')`, [databaseName]);
        assert.deepEqual(moderationTriggers, [
            { TableName: 'commentmoderationlogs', EventManipulation: 'DELETE' },
            { TableName: 'commentmoderationlogs', EventManipulation: 'UPDATE' },
            { TableName: 'recipemoderationlogs', EventManipulation: 'DELETE' },
            { TableName: 'recipemoderationlogs', EventManipulation: 'UPDATE' },
            { TableName: 'staffmoderationlogs', EventManipulation: 'DELETE' },
            { TableName: 'staffmoderationlogs', EventManipulation: 'UPDATE' },
            { TableName: 'usermoderationlogs', EventManipulation: 'DELETE' },
            { TableName: 'usermoderationlogs', EventManipulation: 'UPDATE' }
        ]);
    });

    it('stores a redacted audit event with all investigation fields', async () => {
        const audit = new AdminAuditService(new AdminAuditRepositoryMysql(connection as unknown as Queryable));
        const receipt = await audit.record({
            actorUserId: 900,
            eventType: ADMIN_AUDIT_EVENT_TYPES.usersBan,
            targetType: ADMIN_AUDIT_TARGET_TYPES.communityUser,
            targetId: 901,
            reason: 'Repeated violation of the test policy.',
            beforeValues: { status: 'active', passwordHash: 'must-not-be-persisted' },
            afterValues: { status: 'banned' },
            ipAddress: '2001:db8::900',
            userAgent: 'Recipe Shelter audit integration test',
            correlationId: '00000000-0000-4000-8000-000000000900'
        });

        const [logs] = await connection.query(`SELECT Id, ActorUserId, Action, TargetType, TargetId, Reason, JSON_UNQUOTE(JSON_EXTRACT(BeforeValues, '$.status')) AS BeforeStatus, JSON_UNQUOTE(JSON_EXTRACT(BeforeValues, '$.passwordHash')) AS BeforePasswordHash, JSON_UNQUOTE(JSON_EXTRACT(AfterValues, '$.status')) AS AfterStatus, IpAddress, UserAgent, CorrelationId, CreatedAt FROM AdminAuditLogs WHERE CorrelationId = '00000000-0000-4000-8000-000000000900'`);
        const log = (logs as Array<Record<string, unknown>>)[0];

        assert.deepEqual(
            log && {
                actorUserId: log.ActorUserId,
                action: log.Action,
                targetType: log.TargetType,
                targetId: log.TargetId,
                reason: log.Reason,
                beforeStatus: log.BeforeStatus,
                beforePasswordHash: log.BeforePasswordHash,
                afterStatus: log.AfterStatus,
                ipAddress: log.IpAddress,
                userAgent: log.UserAgent,
                correlationId: log.CorrelationId
            },
            {
                actorUserId: 900,
                action: 'users.ban',
                targetType: 'community_user',
                targetId: '901',
                reason: 'Repeated violation of the test policy.',
                beforeStatus: 'active',
                beforePasswordHash: '[REDACTED]',
                afterStatus: 'banned',
                ipAddress: '2001:db8::900',
                userAgent: 'Recipe Shelter audit integration test',
                correlationId: '00000000-0000-4000-8000-000000000900'
            }
        );
        assert.equal(receipt.id, log?.Id);
        assert.equal(receipt.correlationId, '00000000-0000-4000-8000-000000000900');
        assert.ok(log?.CreatedAt instanceof Date);
    });

    it('queries a minimized paginated investigation view with every supported filter', async () => {
        const correlationId = '00000000-0000-4000-8000-000000000915';
        await new AdminAuditService(new AdminAuditRepositoryMysql(connection as unknown as Queryable)).record({
            actorUserId: 900,
            eventType: ADMIN_AUDIT_EVENT_TYPES.usersBan,
            targetType: ADMIN_AUDIT_TARGET_TYPES.communityUser,
            targetId: 901,
            reason: 'Audit consultation integration fixture.',
            beforeValues: { status: 'active', accessToken: 'must-not-be-returned' },
            afterValues: { status: 'banned' },
            ipAddress: '2001:db8::905',
            userAgent: 'Sensitive audit integration user agent',
            correlationId
        });

        const result = await new AdminAuditQueryRepositoryMysql(pool).find(
            {
                actorUserId: 900,
                action: ADMIN_AUDIT_EVENT_TYPES.usersBan,
                targetType: ADMIN_AUDIT_TARGET_TYPES.communityUser,
                targetId: '901',
                from: new Date('2020-01-01T00:00:00.000Z'),
                to: new Date('2030-01-01T00:00:00.000Z'),
                correlationId
            },
            { page: 1, limit: 25, offset: 0 }
        );

        assert.deepEqual(result.pagination, {
            page: 1,
            limit: 25,
            totalItems: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false
        });
        assert.deepEqual(
            result.items[0] && {
                actor: result.items[0].actor,
                action: result.items[0].action,
                target: result.items[0].target,
                reason: result.items[0].reason,
                beforeValues: result.items[0].beforeValues,
                afterValues: result.items[0].afterValues,
                correlationId: result.items[0].correlationId
            },
            {
                actor: { id: 900, username: 'audit-staff' },
                action: 'users.ban',
                target: { type: 'community_user', id: '901' },
                reason: 'Audit consultation integration fixture.',
                beforeValues: { status: 'active', accessToken: '[REDACTED]' },
                afterValues: { status: 'banned' },
                correlationId
            }
        );
        assert.ok(result.items[0]?.createdAt instanceof Date);
        assert.equal('ipAddress' in (result.items[0] ?? {}), false);
        assert.equal('userAgent' in (result.items[0] ?? {}), false);
    });

    it('commits exactly one audit entry with a sensitive action and rolls both back on audit failure', async () => {
        const auditActions = new AdminAuditActionRunnerMysql(pool, (db) => new AdminAuditService(new AdminAuditRepositoryMysql(db)));
        const service = new AdminUserService(new UserRepositoryMysql(pool), new AdminUserRepositoryMysql(pool), auditActions);

        await service.ban(901, 900, 'Repeated violation confirmed by integration test.', {
            ipAddress: '192.0.2.90',
            userAgent: 'Recipe Shelter audited action integration test',
            correlationId: '00000000-0000-4000-8000-000000000905'
        });

        const [committed] = await connection.query(`SELECT cp.Status, (SELECT COUNT(*) FROM AdminAuditLogs WHERE CorrelationId = ?) AS AuditCount FROM CommunityProfiles AS cp WHERE cp.UserId = 901`, ['00000000-0000-4000-8000-000000000905']);
        assert.deepEqual(committed, [{ Status: 'banned', AuditCount: 1 }]);

        await service.unban(901, 900, 'Integration test restores the account after review.', {
            correlationId: '00000000-0000-4000-8000-000000000906'
        });
        const [businessLogs] = await connection.query(`SELECT audit.Id AS AdminAuditLogId, audit.Action, audit.Reason, audit.CorrelationId FROM UserModerationLogs AS log INNER JOIN AdminAuditLogs AS audit ON audit.Id = log.AdminAuditLogId WHERE log.UserId = 901 ORDER BY audit.Id`);
        assert.deepEqual(
            (businessLogs as Array<Record<string, unknown>>).map(({ Action, Reason, CorrelationId }) => ({
                Action,
                Reason,
                CorrelationId
            })),
            [
                {
                    Action: 'users.ban',
                    Reason: 'Repeated violation confirmed by integration test.',
                    CorrelationId: '00000000-0000-4000-8000-000000000905'
                },
                {
                    Action: 'users.unban',
                    Reason: 'Integration test restores the account after review.',
                    CorrelationId: '00000000-0000-4000-8000-000000000906'
                }
            ]
        );
        assert.ok((businessLogs as Array<{ AdminAuditLogId: number }>).every(({ AdminAuditLogId }) => AdminAuditLogId > 0));

        const failingService = new AdminUserService(
            new UserRepositoryMysql(pool),
            new AdminUserRepositoryMysql(pool),
            new AdminAuditActionRunnerMysql(pool, () => ({
                async record() {
                    throw new Error('forced audit failure');
                }
            }))
        );
        const [moderationLogsBefore] = await connection.query('SELECT COUNT(*) AS LogCount FROM UserModerationLogs WHERE UserId = 901');

        await assert.rejects(
            () => failingService.ban(901, 900, 'This moderation must be rolled back with its failed audit.', {}),
            /forced audit failure/
        );

        const [rolledBack] = await connection.query(`SELECT cp.Status, (SELECT COUNT(*) FROM UserModerationLogs WHERE UserId = 901) AS ModerationLogCount FROM CommunityProfiles AS cp WHERE cp.UserId = 901`);
        assert.deepEqual(rolledBack, [
            {
                Status: 'active',
                ModerationLogCount: (moderationLogsBefore as Array<{ LogCount: number }>)[0]?.LogCount
            }
        ]);

        const failingModerationLogService = new AdminUserService(new UserRepositoryMysql(pool), new FailingModerationLogAdminUserRepository(pool), auditActions);
        await assert.rejects(
            () =>
                failingModerationLogService.ban(901, 900, 'This moderation must be rolled back with its specialized log.', {
                    correlationId: '00000000-0000-4000-8000-000000000907'
                }),
            /forced specialized moderation log failure/
        );
        const [specializedLogRollback] = await connection.query(`SELECT cp.Status, (SELECT COUNT(*) FROM AdminAuditLogs WHERE CorrelationId = ?) AS AuditCount, (SELECT COUNT(*) FROM UserModerationLogs WHERE UserId = 901) AS ModerationLogCount FROM CommunityProfiles AS cp WHERE cp.UserId = 901`, ['00000000-0000-4000-8000-000000000907']);
        assert.deepEqual(specializedLogRollback, [
            {
                Status: 'active',
                AuditCount: 0,
                ModerationLogCount: (moderationLogsBefore as Array<{ LogCount: number }>)[0]?.LogCount
            }
        ]);
    });

    it('rejects invalid actors and malformed investigation values', async () => {
        const validValues = `
            'users.ban', 'community_user', '901',
            JSON_OBJECT('status', 'active'), JSON_OBJECT('status', 'banned'),
            '00000000-0000-4000-8000-000000000901'`;

        await assert.rejects(() =>
            connection.query(
                `INSERT INTO AdminAuditLogs
               (ActorUserId, Action, TargetType, TargetId, BeforeValues, AfterValues, CorrelationId)
             VALUES (901, ${validValues})`
            )
        );
        await assert.rejects(() =>
            connection.query(
                `INSERT INTO AdminAuditLogs
               (ActorUserId, Action, TargetType, TargetId, BeforeValues, AfterValues, CorrelationId)
             VALUES (999999, ${validValues})`
            )
        );
        await assert.rejects(() => connection.query(`INSERT INTO AdminAuditLogs (ActorUserId, Action, TargetType, TargetId, BeforeValues, AfterValues, CorrelationId) VALUES (900, ' ', 'community_user', '901', JSON_OBJECT(), JSON_OBJECT(), '00000000-0000-4000-8000-000000000902')`));
        await assert.rejects(() => connection.query(`INSERT INTO AdminAuditLogs (ActorUserId, Action, TargetType, TargetId, BeforeValues, AfterValues, CorrelationId) VALUES (900, 'users.ban', 'community_user', '901', JSON_ARRAY('active'), JSON_OBJECT(), '00000000-0000-4000-8000-000000000903')`));
        await assert.rejects(() => connection.query(`INSERT INTO AdminAuditLogs (ActorUserId, Action, TargetType, TargetId, BeforeValues, AfterValues, CorrelationId) VALUES (900, 'users.ban', 'community_user', '901', JSON_OBJECT(), JSON_OBJECT(), 'too-short')`));
    });

    it('keeps audit records immutable and preserves their actor', async () => {
        await assert.rejects(() => connection.query(`UPDATE AdminAuditLogs SET Reason = 'A rewritten reason.' WHERE CorrelationId = '00000000-0000-4000-8000-000000000900'`), (error) => assertImmutableAuditError(error, 'UPDATE'));
        await assert.rejects(() => connection.query(`DELETE FROM AdminAuditLogs WHERE CorrelationId = '00000000-0000-4000-8000-000000000900'`), (error) => assertImmutableAuditError(error, 'DELETE'));
        await assert.rejects(() => connection.query('DELETE FROM Users WHERE Id = 900'));

        const [remainingLogs] = await connection.query(`SELECT Reason FROM AdminAuditLogs WHERE CorrelationId = '00000000-0000-4000-8000-000000000900'`);
        assert.deepEqual(remainingLogs, [{ Reason: 'Repeated violation of the test policy.' }]);
    });

    it('keeps specialized moderation histories immutable and rejects orphan links', async () => {
        const [auditRows] = await connection.query(`SELECT Id FROM AdminAuditLogs WHERE CorrelationId = '00000000-0000-4000-8000-000000000900'`);
        const auditLogId = (auditRows as Array<{ Id: number }>)[0]?.Id;
        assert.ok(auditLogId);
        await assert.rejects(() => new AdminUserRepositoryMysql(pool).createModerationLog(auditLogId, 999, connection as unknown as Parameters<AdminUserRepositoryMysql['createModerationLog']>[2]), /does not match its administrative audit entry/);
        await assert.rejects(() => connection.query(`INSERT INTO UserModerationLogs (AdminAuditLogId, UserId) VALUES (999999, 901)`));
        await assert.rejects(() => connection.query(`UPDATE UserModerationLogs SET UserId = 901 WHERE AdminAuditLogId = (SELECT Id FROM AdminAuditLogs WHERE CorrelationId = '00000000-0000-4000-8000-000000000905')`), /User moderation logs are append-only: UPDATE is forbidden/);
        await assert.rejects(() => connection.query(`DELETE FROM UserModerationLogs WHERE AdminAuditLogId = (SELECT Id FROM AdminAuditLogs WHERE CorrelationId = '00000000-0000-4000-8000-000000000905')`), /User moderation logs are append-only: DELETE is forbidden/);
    });
});
