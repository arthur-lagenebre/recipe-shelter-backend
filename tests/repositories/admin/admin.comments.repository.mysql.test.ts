import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AdminCommentRepositoryMysql } from '../../../src/repositories/admin/admin.comments.repository.mysql.js';

import type { Pool, PoolConnection } from 'mysql2/promise';

describe('AdminCommentRepositoryMysql countReplies', () => {
    it('returns 0 when the comment has no replies', async () => {
        const statements: Array<{ sql: string; params: unknown }> = [];
        const db = createConnection(statements, [[[{ Count: 0 }], []]]);
        const repository = new AdminCommentRepositoryMysql({} as Pool);

        assert.equal(await repository.countReplies(1, db), 0);
        assert.match(statements[0]?.sql ?? '', /WHERE ParentCommentId = \?/);
        assert.deepEqual(statements[0]?.params, [1]);
    });

    it('counts every reply regardless of its moderation or soft-delete state', async () => {
        const db = createConnection([], [[[{ Count: 3 }], []]]);
        const repository = new AdminCommentRepositoryMysql({} as Pool);

        assert.equal(await repository.countReplies(1, db), 3);
    });
});

function createConnection(statements: Array<{ sql: string; params: unknown }>, responses: unknown[]): PoolConnection {
    return {
        async execute(sql: string, params: unknown) {
            statements.push({ sql, params });
            const response = responses.shift();

            if (!response)
                throw new Error('Unexpected SQL statement');

            return response;
        }
    } as unknown as PoolConnection;
}
