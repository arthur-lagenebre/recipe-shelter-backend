import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AdminIngredientRepositoryMysql } from '../../../src/repositories/admin/admin.ingredients.repository.mysql.js';

import type { Pool, PoolConnection } from 'mysql2/promise';

describe('AdminIngredientRepositoryMysql merge', () => {
  it('transfers recipe references without rewriting author labels, aliases and historical redirects', async () => {
    const statements: Array<{ sql: string; params: unknown }> = [];
    const db = createConnection(statements, [
      [[
        { Id: 1, IngredientId: 10 },
        { Id: 2, IngredientId: 10 },
        { Id: 3, IngredientId: 20 }
      ], []],
      [{ affectedRows: 2 }, []],
      [[
        { Id: 100, IngredientId: 10 },
        { Id: 101, IngredientId: 20 },
        { Id: 102, IngredientId: 20 }
      ], []],
      [{ affectedRows: 1 }, []],
      [[{ Id: 30 }, { Id: 31 }], []],
      [{ affectedRows: 2 }, []],
      [{ affectedRows: 1 }, []]
    ]);
    const repository = new AdminIngredientRepositoryMysql({} as Pool);

    assert.deepEqual(await repository.merge(10, 20, db), {
      merged: true,
      sourceRecipeAssociationCountBefore: 2,
      targetRecipeAssociationCountBefore: 1,
      targetRecipeAssociationCountAfter: 3,
      transferredRecipeAssociationCount: 2,
      sourceAliasCountBefore: 1,
      targetAliasCountBefore: 2,
      targetAliasCountAfter: 3,
      transferredAliasCount: 1,
      redirectedMergedIngredientCount: 2
    });
    assert.equal(statements.length, 7);
    assert.match(statements[0]?.sql ?? '', /FROM RecipeIngredients[\s\S]*FOR UPDATE/);
    assert.match(statements[1]?.sql ?? '', /^UPDATE RecipeIngredients/);
    assert.match(statements[1]?.sql ?? '', /SET IngredientId = \?/);
    assert.doesNotMatch(statements[1]?.sql ?? '', /DisplayText|Quantity|Unit|Note/);
    assert.deepEqual(statements[1]?.params, [20, 10]);
    assert.match(statements[2]?.sql ?? '', /FROM IngredientAliases[\s\S]*FOR UPDATE/);
    assert.deepEqual(statements[3]?.params, [20, 10]);
    assert.match(statements[4]?.sql ?? '', /FROM Ingredients[\s\S]*MergedIntoIngredientId[\s\S]*FOR UPDATE/);
    assert.deepEqual(statements[6]?.params, [20, 10]);
  });

  it('fails closed if locked recipe relationships change before transfer', async () => {
    const statements: Array<{ sql: string; params: unknown }> = [];
    const db = createConnection(statements, [
      [[{ Id: 1, IngredientId: 10 }], []],
      [{ affectedRows: 0 }, []]
    ]);
    const repository = new AdminIngredientRepositoryMysql({} as Pool);

    await assert.rejects(
      () => repository.merge(10, 20, db),
      /Ingredient recipe associations changed during merge/
    );
    assert.equal(statements.length, 2);
    assert.doesNotMatch(statements.map(({ sql }) => sql).join('\n'), /UPDATE IngredientAliases|SET Status = 'merged'/);
  });

  it('reports a concurrent source-status no-op without inventing transfer counts', async () => {
    const statements: Array<{ sql: string; params: unknown }> = [];
    const db = createConnection(statements, [
      [[], []],
      [{ affectedRows: 0 }, []],
      [[], []],
      [{ affectedRows: 0 }, []],
      [[], []],
      [{ affectedRows: 0 }, []],
      [{ affectedRows: 0 }, []]
    ]);
    const repository = new AdminIngredientRepositoryMysql({} as Pool);

    assert.deepEqual(await repository.merge(10, 20, db), {
      merged: false,
      sourceRecipeAssociationCountBefore: 0,
      targetRecipeAssociationCountBefore: 0,
      targetRecipeAssociationCountAfter: 0,
      transferredRecipeAssociationCount: 0,
      sourceAliasCountBefore: 0,
      targetAliasCountBefore: 0,
      targetAliasCountAfter: 0,
      transferredAliasCount: 0,
      redirectedMergedIngredientCount: 0
    });
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
