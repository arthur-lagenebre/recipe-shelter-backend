import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AdminTagRepositoryMysql } from '../../../src/repositories/admin/admin.tags.repository.mysql.js';

import type { Pool, PoolConnection } from 'mysql2/promise';

describe('AdminTagRepositoryMysql merge', () => {
  it('locks relationships, transfers only missing targets and reports deduplication', async () => {
    const statements: Array<{ sql: string; params: unknown }> = [];
    const responses = [
      [[
        { RecipeId: 1, TagId: 10 },
        { RecipeId: 2, TagId: 10 },
        { RecipeId: 2, TagId: 20 },
        { RecipeId: 3, TagId: 20 }
      ], []],
      [{ affectedRows: 1 }, []],
      [{ affectedRows: 2 }, []],
      [{ affectedRows: 2 }, []],
      [{ affectedRows: 1 }, []]
    ];
    const db = createConnection(statements, responses);
    const repository = new AdminTagRepositoryMysql({} as Pool);

    const result = await repository.merge(10, 20, db);

    assert.deepEqual(result, {
      merged: true,
      sourceRecipeCountBefore: 2,
      targetRecipeCountBefore: 2,
      targetRecipeCountAfter: 3,
      transferredRecipeCount: 1,
      deduplicatedRecipeCount: 1,
      redirectedMergedTagCount: 2
    });
    assert.equal(statements.length, 5);
    assert.match(statements[0]?.sql ?? '', /FROM RecipeTags[\s\S]*FOR UPDATE/);
    assert.deepEqual(statements[0]?.params, [10, 20]);
    assert.match(statements[1]?.sql ?? '', /^INSERT INTO RecipeTags/);
    assert.match(statements[1]?.sql ?? '', /NOT EXISTS/);
    assert.doesNotMatch(statements[1]?.sql ?? '', /IGNORE/);
    assert.deepEqual(statements[1]?.params, [20, 10, 20]);
  });

  it('fails closed when locked association counts no longer match the writes', async () => {
    const statements: Array<{ sql: string; params: unknown }> = [];
    const db = createConnection(statements, [
      [[{ RecipeId: 1, TagId: 10 }], []],
      [{ affectedRows: 0 }, []],
      [{ affectedRows: 1 }, []]
    ]);
    const repository = new AdminTagRepositoryMysql({} as Pool);

    await assert.rejects(
      () => repository.merge(10, 20, db),
      /Tag recipe associations changed during merge/
    );
    assert.equal(statements.length, 3);
    assert.doesNotMatch(statements.map(({ sql }) => sql).join('\n'), /UPDATE Tags/);
  });

  it('reports an empty relationship set and a concurrent tag no-op without inventing counts', async () => {
    const statements: Array<{ sql: string; params: unknown }> = [];
    const db = createConnection(statements, [
      [[], []],
      [{ affectedRows: 0 }, []],
      [{ affectedRows: 0 }, []],
      [{ affectedRows: 0 }, []],
      [{ affectedRows: 0 }, []]
    ]);
    const repository = new AdminTagRepositoryMysql({} as Pool);

    assert.deepEqual(await repository.merge(10, 20, db), {
      merged: false,
      sourceRecipeCountBefore: 0,
      targetRecipeCountBefore: 0,
      targetRecipeCountAfter: 0,
      transferredRecipeCount: 0,
      deduplicatedRecipeCount: 0,
      redirectedMergedTagCount: 0
    });
    assert.equal(statements.length, 5);
  });
});

function createConnection(
  statements: Array<{ sql: string; params: unknown }>,
  responses: unknown[]
): PoolConnection {
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
