import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AdminAuditQueryRepositoryMysql } from '../../../src/repositories/admin/admin-audit-query.repository.mysql.js';

import type { Queryable } from '../../../src/db/query.js';

type ExecuteCall = {
  sql: string;
  params: unknown;
};

describe('AdminAuditQueryRepositoryMysql', () => {
  it('applies all filters to count and page queries and returns stable pagination', async () => {
    const calls: ExecuteCall[] = [];
    const createdAt = new Date('2026-07-17T10:30:00.000Z');
    const from = new Date('2026-07-01T00:00:00.000Z');
    const to = new Date('2026-07-31T23:59:59.000Z');
    const db = {
      async execute(sql: string, params: unknown) {
        calls.push({ sql, params });

        if (sql.includes('COUNT(*)'))
          return [[{ Count: '51' }], []];

        return [[{
          Id: 82,
          ActorUserId: 7,
          ActorUsername: 'audit-admin',
          Action: 'users.ban',
          TargetType: 'community_user',
          TargetId: '42',
          Reason: 'Repeated abuse confirmed.',
          BeforeValues: { status: 'active' },
          AfterValues: { status: 'banned' },
          CorrelationId: '00000000-0000-4000-8000-000000000082',
          CreatedAt: createdAt
        }], []];
      }
    } as unknown as Queryable;
    const repository = new AdminAuditQueryRepositoryMysql(db);

    const result = await repository.find({
      actorUserId: 7,
      action: 'users.ban',
      targetType: 'community_user',
      targetId: '42',
      from,
      to,
      correlationId: '00000000-0000-4000-8000-000000000082'
    }, { page: 2, limit: 25, offset: 25 });

    assert.equal(calls.length, 2);
    const expectedParams = [
      7,
      'users.ban',
      'community_user',
      '42',
      from,
      to,
      '00000000-0000-4000-8000-000000000082'
    ];

    for (const call of calls) {
      assert.match(call.sql, /audit\.ActorUserId = \?/);
      assert.match(call.sql, /audit\.Action = \?/);
      assert.match(call.sql, /audit\.TargetType = \?/);
      assert.match(call.sql, /audit\.TargetId = \?/);
      assert.match(call.sql, /audit\.CreatedAt >= \?/);
      assert.match(call.sql, /audit\.CreatedAt <= \?/);
      assert.match(call.sql, /audit\.CorrelationId = \?/);
      assert.deepEqual(call.params, expectedParams);
    }

    assert.match(calls[1]?.sql ?? '', /ORDER BY audit\.CreatedAt DESC, audit\.Id DESC/);
    assert.match(calls[1]?.sql ?? '', /LIMIT 25 OFFSET 25/);
    assert.deepEqual(result, {
      items: [{
        id: 82,
        actor: { id: 7, username: 'audit-admin' },
        action: 'users.ban',
        target: { type: 'community_user', id: '42' },
        reason: 'Repeated abuse confirmed.',
        beforeValues: { status: 'active' },
        afterValues: { status: 'banned' },
        correlationId: '00000000-0000-4000-8000-000000000082',
        createdAt
      }],
      pagination: {
        page: 2,
        limit: 25,
        totalItems: 51,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true
      }
    });
  });

  it('does not select high-sensitivity transport or account fields', async () => {
    const statements: string[] = [];
    const db = {
      async execute(sql: string) {
        statements.push(sql);
        return sql.includes('COUNT(*)') ? [[{ Count: 0 }], []] : [[], []];
      }
    } as unknown as Queryable;

    await new AdminAuditQueryRepositoryMysql(db).find({}, { page: 1, limit: 25, offset: 0 });

    const pageQuery = statements[1] ?? '';
    assert.doesNotMatch(pageQuery, /IpAddress|UserAgent|Mail|Password/i);
    assert.match(pageQuery, /actor\.Username AS ActorUsername/);
  });
});
