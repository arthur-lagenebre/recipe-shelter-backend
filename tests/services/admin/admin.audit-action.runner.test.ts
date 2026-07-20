import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AdminAuditActionRunnerMysql } from '../../../src/services/admin/admin.audit-action.runner.js';

import type { AdminAuditRecorder } from '../../../src/services/admin/admin.audit.service.js';
import type { PoolConnection } from 'mysql2/promise';

describe('AdminAuditActionRunnerMysql', () => {
  it('commits the sensitive mutation and its audit on the same connection', async () => {
    const events: string[] = [];
    const connection = createConnection(events);
    const runner = createRunner(connection, events);

    const result = await runner.run(async ({ db, audit }) => {
      assert.equal(db, connection);
      events.push('action');
      await audit.record(createAuditInput());
      return 'done';
    });

    assert.equal(result, 'done');
    assert.deepEqual(events, ['begin', 'action', 'audit', 'commit', 'release']);
  });

  it('rolls the sensitive mutation back when the mandatory audit fails', async () => {
    const events: string[] = [];
    const connection = createConnection(events);
    const runner = createRunner(connection, events, new Error('audit unavailable'));

    await assert.rejects(
      () => runner.run(async ({ audit }) => {
        events.push('action');
        await audit.record(createAuditInput());
      }),
      /audit unavailable/
    );

    assert.deepEqual(events, ['begin', 'action', 'audit', 'rollback', 'release']);
  });

  it('rolls back successful callbacks that do not create exactly one audit entry', async () => {
    const events: string[] = [];
    const connection = createConnection(events);
    const runner = createRunner(connection, events);

    await assert.rejects(
      () => runner.run(async () => {
        events.push('action');
      }),
      (error) => {
        assert.equal((error as { code?: string }).code, 'ADMIN_AUDIT_RECORD_FAILED');
        return true;
      }
    );

    assert.deepEqual(events, ['begin', 'action', 'rollback', 'release']);
  });

  it('rolls back before commit when a sensitive action creates more than one audit entry', async () => {
    const events: string[] = [];
    const connection = createConnection(events);
    const runner = createRunner(connection, events);

    await assert.rejects(
      () => runner.run(async ({ audit }) => {
        events.push('action');
        await audit.record(createAuditInput());
        await audit.record(createAuditInput());
      }),
      (error) => {
        assert.equal((error as { code?: string }).code, 'ADMIN_AUDIT_RECORD_FAILED');
        return true;
      }
    );

    assert.deepEqual(events, ['begin', 'action', 'audit', 'rollback', 'release']);
  });

  it('rolls back a no-op result that incorrectly creates an audit entry', async () => {
    const events: string[] = [];
    const connection = createConnection(events);
    const runner = createRunner(connection, events);

    await assert.rejects(
      () => runner.run(async ({ audit }) => {
        events.push('action');
        await audit.record(createAuditInput());
        return false;
      }),
      (error) => {
        assert.equal((error as { code?: string }).code, 'ADMIN_AUDIT_RECORD_FAILED');
        return true;
      }
    );

    assert.deepEqual(events, ['begin', 'action', 'audit', 'rollback', 'release']);
  });

  it('commits a no-op result only when it creates no audit entry', async () => {
    const events: string[] = [];
    const connection = createConnection(events);
    const runner = createRunner(connection, events);

    assert.equal(await runner.run(async () => false), false);
    assert.deepEqual(events, ['begin', 'commit', 'release']);
  });
});

function createRunner(connection: PoolConnection, events: string[], auditError?: Error) {
  return new AdminAuditActionRunnerMysql(
    {
      async getConnection() {
        return connection;
      }
    },
    (db): AdminAuditRecorder => ({
      async record(input) {
        assert.equal(db, connection);
        assert.equal(input.eventType, 'users.ban');
        events.push('audit');

        if (auditError)
          throw auditError;

        return { id: 1, correlationId: input.correlationId! };
      }
    })
  );
}

function createConnection(events: string[]): PoolConnection {
  return {
    async beginTransaction() {
      events.push('begin');
    },
    async commit() {
      events.push('commit');
    },
    async rollback() {
      events.push('rollback');
    },
    release() {
      events.push('release');
    }
  } as unknown as PoolConnection;
}

function createAuditInput() {
  return {
    actorUserId: 1,
    eventType: 'users.ban' as const,
    targetType: 'community_user' as const,
    targetId: 2,
    correlationId: '00000000-0000-4000-8000-000000000804'
  };
}
