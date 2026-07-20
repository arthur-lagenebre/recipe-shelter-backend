import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AdminAuditRepositoryMysql } from '../../../src/repositories/admin/admin.audit.repository.mysql.js';

import type { AdminAuditRepository } from '../../../src/repositories/admin/admin.audit.repository.interface.js';
import type { Queryable } from '../../../src/db/query.js';

type HasExactKeys<T, Expected extends PropertyKey> =
    Exclude<keyof T, Expected> extends never ? (Exclude<Expected, keyof T> extends never ? true : false) : false;

describe('AdminAuditRepositoryMysql', () => {
    it('exposes only the append operation at the application persistence boundary', () => {
        const isAppendOnly: HasExactKeys<AdminAuditRepository, 'create'> = true;

        assert.equal(isAppendOnly, true);
    });

    it('uses the single append-only insert and serializes investigation snapshots', async () => {
        const statements: Array<{ sql: string; params: unknown }> = [];
        const db = {
            async execute(sql: string, params: unknown) {
                statements.push({ sql, params });
                return [{ insertId: 82, affectedRows: 1 }, []];
            }
        } as unknown as Queryable;
        const repository = new AdminAuditRepositoryMysql(db);

        const id = await repository.create({
            actorUserId: 7,
            action: 'users.ban',
            targetType: 'community_user',
            targetId: '42',
            reason: 'Repeated abuse confirmed.',
            beforeValues: { status: 'active' },
            afterValues: { status: 'banned' },
            ipAddress: '2001:db8::7',
            userAgent: 'Admin browser',
            correlationId: '00000000-0000-4000-8000-000000000802'
        });

        assert.equal(id, 82);
        assert.equal(statements.length, 1);
        assert.match(statements[0]?.sql ?? '', /^INSERT INTO AdminAuditLogs/);
        assert.doesNotMatch(statements[0]?.sql ?? '', /UPDATE|DELETE/);
        assert.deepEqual(statements[0]?.params, [
            7,
            'users.ban',
            'community_user',
            '42',
            'Repeated abuse confirmed.',
            JSON.stringify({ status: 'active' }),
            JSON.stringify({ status: 'banned' }),
            '2001:db8::7',
            'Admin browser',
            '00000000-0000-4000-8000-000000000802'
        ]);
    });
});
