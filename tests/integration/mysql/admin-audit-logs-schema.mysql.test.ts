import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import mysql from 'mysql2/promise';

import { AdminAuditRepositoryMysql } from '../../../src/repositories/admin/admin-audit.repository.mysql.js';
import { ADMIN_AUDIT_EVENT_TYPES, ADMIN_AUDIT_TARGET_TYPES } from '../../../src/services/admin/admin-audit.events.js';
import { AdminAuditService } from '../../../src/services/admin/admin-audit.service.js';
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

describe('admin audit logs schema integration', { skip: !mysqlEnabled && 'Set TEST_DB_NAME to run isolated MySQL tests' }, () => {
    let connection: mysql.Connection;

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
        await connection.query(
            `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );

        const schemaPath = new URL('../../../database/migrations/1_create_schema.sql', import.meta.url);
        const seedPath = new URL('../../../database/seed.sql', import.meta.url);
        const schema = targetDatabase(await readFile(schemaPath, 'utf8'), databaseName);
        const seed = targetDatabase(await readFile(seedPath, 'utf8'), databaseName);

        await connection.query(schema);
        await connection.query(seed);
        await connection.query(
            `INSERT INTO Users (Id, Mail, Username, Password, AccountType, Status)
             VALUES
               (900, 'audit-staff@test.local', 'audit-staff', 'non-secret-test-hash', 'staff', 'inactive'),
               (901, 'audit-community@test.local', 'audit-community', 'non-secret-test-hash', 'community', 'active')`
        );
    });

    after(async () => {
        if (connection) {
            await connection.query(`DROP DATABASE IF EXISTS \`${requireAuditTestDatabaseName()}\``);
            await connection.end();
        }
    });

    it('creates the complete investigation model from an empty database and the central seed', async () => {
        const databaseName = requireAuditTestDatabaseName();
        const [columns] = await connection.query(
            `SELECT COLUMN_NAME AS ColumnName, DATA_TYPE AS DataType, IS_NULLABLE AS IsNullable
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'AdminAuditLogs'
             ORDER BY ORDINAL_POSITION`,
            [databaseName]
        );

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

        const [indexes] = await connection.query(
            `SELECT DISTINCT INDEX_NAME AS IndexName
             FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'AdminAuditLogs'
             ORDER BY INDEX_NAME`,
            [databaseName]
        );
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

        const [seededLogs] = await connection.query('SELECT COUNT(*) AS LogCount FROM AdminAuditLogs');
        assert.deepEqual(seededLogs, [{ LogCount: 0 }]);
    });

    it('stores a redacted audit event with all investigation fields', async () => {
        const audit = new AdminAuditService(
            new AdminAuditRepositoryMysql(connection as unknown as Queryable)
        );
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

        const [logs] = await connection.query(
            `SELECT Id, ActorUserId, Action, TargetType, TargetId, Reason,
                    JSON_UNQUOTE(JSON_EXTRACT(BeforeValues, '$.status')) AS BeforeStatus,
                    JSON_UNQUOTE(JSON_EXTRACT(BeforeValues, '$.passwordHash')) AS BeforePasswordHash,
                    JSON_UNQUOTE(JSON_EXTRACT(AfterValues, '$.status')) AS AfterStatus,
                    IpAddress, UserAgent, CorrelationId, CreatedAt
             FROM AdminAuditLogs
             WHERE CorrelationId = '00000000-0000-4000-8000-000000000900'`
        );
        const log = (logs as Array<Record<string, unknown>>)[0];

        assert.deepEqual(log && {
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
        }, {
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
        });
        assert.equal(receipt.id, log?.Id);
        assert.equal(receipt.correlationId, '00000000-0000-4000-8000-000000000900');
        assert.ok(log?.CreatedAt instanceof Date);
    });

    it('rejects invalid actors and malformed investigation values', async () => {
        const validValues = `
            'users.ban', 'community_user', '901',
            JSON_OBJECT('status', 'active'), JSON_OBJECT('status', 'banned'),
            '00000000-0000-4000-8000-000000000901'`;

        await assert.rejects(() => connection.query(
            `INSERT INTO AdminAuditLogs
               (ActorUserId, Action, TargetType, TargetId, BeforeValues, AfterValues, CorrelationId)
             VALUES (901, ${validValues})`
        ));
        await assert.rejects(() => connection.query(
            `INSERT INTO AdminAuditLogs
               (ActorUserId, Action, TargetType, TargetId, BeforeValues, AfterValues, CorrelationId)
             VALUES (999999, ${validValues})`
        ));
        await assert.rejects(() => connection.query(
            `INSERT INTO AdminAuditLogs
               (ActorUserId, Action, TargetType, TargetId, BeforeValues, AfterValues, CorrelationId)
             VALUES
               (900, ' ', 'community_user', '901', JSON_OBJECT(), JSON_OBJECT(),
                '00000000-0000-4000-8000-000000000902')`
        ));
        await assert.rejects(() => connection.query(
            `INSERT INTO AdminAuditLogs
               (ActorUserId, Action, TargetType, TargetId, BeforeValues, AfterValues, CorrelationId)
             VALUES
               (900, 'users.ban', 'community_user', '901', JSON_ARRAY('active'), JSON_OBJECT(),
                '00000000-0000-4000-8000-000000000903')`
        ));
        await assert.rejects(() => connection.query(
            `INSERT INTO AdminAuditLogs
               (ActorUserId, Action, TargetType, TargetId, BeforeValues, AfterValues, CorrelationId)
             VALUES
               (900, 'users.ban', 'community_user', '901', JSON_OBJECT(), JSON_OBJECT(), 'too-short')`
        ));
    });

    it('keeps audit records immutable and preserves their actor', async () => {
        await assert.rejects(() => connection.query(
            `UPDATE AdminAuditLogs
             SET Reason = 'A rewritten reason.'
             WHERE CorrelationId = '00000000-0000-4000-8000-000000000900'`
        ));
        await assert.rejects(() => connection.query(
            `DELETE FROM AdminAuditLogs
             WHERE CorrelationId = '00000000-0000-4000-8000-000000000900'`
        ));
        await assert.rejects(() => connection.query('DELETE FROM Users WHERE Id = 900'));

        const [remainingLogs] = await connection.query(
            `SELECT Reason
             FROM AdminAuditLogs
             WHERE CorrelationId = '00000000-0000-4000-8000-000000000900'`
        );
        assert.deepEqual(remainingLogs, [{ Reason: 'Repeated violation of the test policy.' }]);
    });
});
