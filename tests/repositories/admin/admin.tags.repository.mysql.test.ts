import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AdminTagRepositoryMysql } from '../../../src/repositories/admin/admin.tags.repository.mysql.js';

import type { Pool, PoolConnection } from 'mysql2/promise';

const pagination = { page: 1, limit: 10, offset: 0 };

const tagRow = {
  Id: 42,
  Name: 'Coverage tag',
  NormalizedName: 'coverage tag',
  Slug: 'coverage-tag',
  Description: 'Tag used for repository branch coverage.',
  Status: 'active',
  MergedIntoTagId: null,
  CreatedAt: new Date('2026-07-20T10:00:00.000Z'),
  UpdatedAt: new Date('2026-07-20T11:00:00.000Z'),
  GroupId: 7,
  GroupName: 'Coverage group',
  GroupSlug: 'coverage-group',
  GroupSortOrder: 3
};

describe('AdminTagRepositoryMysql catalog operations', () => {
  it('returns an empty unfiltered page when the count query has no row', async () => {
    const statements: Array<{ sql: string; params: unknown }> = [];
    const pool = createConnection(statements, [
      [[], []],
      [[], []]
    ]);
    const repository = new AdminTagRepositoryMysql(pool as unknown as Pool);

    assert.deepEqual(await repository.find({}, pagination), {
      items: [],
      pagination: {
        page: 1,
        limit: 10,
        totalItems: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false
      }
    });
    assert.equal(statements.length, 2);
    assert.match(statements[0]?.sql ?? '', /WHERE 1 = 1/);
    assert.deepEqual(statements[0]?.params, []);
  });

  it('short-circuits empty locks and reports boolean catalogue operations', async () => {
    const statements: Array<{ sql: string; params: unknown }> = [];
    const db = createConnection(statements, [
      [[{ Exists: 1 }], []],
      [[], []],
      [[{ Exists: 1 }], []],
      [[], []],
      [{ affectedRows: 1 }, []],
      [{ affectedRows: 0 }, []]
    ]);
    const repository = new AdminTagRepositoryMysql({} as Pool);

    assert.deepEqual(await repository.findByIdsForUpdate([], db), []);
    assert.equal(statements.length, 0);
    assert.equal(await repository.groupExists(7, db), true);
    assert.equal(await repository.groupExists(8, db), false);
    assert.equal(await repository.hasMergedAliases(42, db), true);
    assert.equal(await repository.hasMergedAliases(43, db), false);
    assert.equal(await repository.deprecate(42, db), true);
    assert.equal(await repository.deprecate(43, db), false);
  });

  it('creates and updates tags, including the defensive reload failures', async () => {
    const createStatements: Array<{ sql: string; params: unknown }> = [];
    const createDb = createConnection(createStatements, [
      [{ insertId: 42, affectedRows: 1 }, []],
      [[tagRow], []]
    ]);
    const repository = new AdminTagRepositoryMysql({} as Pool);
    const writeInput = {
      groupId: 7,
      name: 'Coverage tag',
      normalizedName: 'coverage tag',
      slug: 'coverage-tag',
      description: 'Tag used for repository branch coverage.'
    };

    const created = await repository.create(writeInput, createDb);
    assert.equal(created.status, 'written');
    assert.equal(created.status === 'written' && created.tag.id, 42);

    const updateDb = createConnection([], [
      [{ affectedRows: 1 }, []],
      [[tagRow], []]
    ]);
    const updated = await repository.update({ id: 42, ...writeInput }, updateDb);
    assert.equal(updated.status, 'written');

    const missingCreateDb = createConnection([], [
      [{ insertId: 43, affectedRows: 1 }, []],
      [[], []]
    ]);
    await assert.rejects(
      () => repository.create({ ...writeInput, slug: 'missing-create-reload' }, missingCreateDb),
      /Tag created but cannot be reloaded/
    );

    const missingUpdateDb = createConnection([], [
      [{ affectedRows: 1 }, []],
      [[], []]
    ]);
    await assert.rejects(
      () => repository.update({ id: 999, ...writeInput }, missingUpdateDb),
      /Tag updated but cannot be reloaded/
    );
  });

  it('maps canonical duplicate conflicts and preserves unexpected write errors', async () => {
    const repository = new AdminTagRepositoryMysql({} as Pool);
    const writeInput = {
      groupId: 7,
      name: 'Coverage tag',
      normalizedName: 'coverage tag',
      slug: 'coverage-tag',
      description: null
    };

    const normalizedDuplicate = duplicateError('tags_active_normalized_name_UK');
    assert.deepEqual(
      await repository.create(writeInput, createConnection([], [throwResponse(normalizedDuplicate)])),
      { status: 'normalized_name_taken' }
    );

    const slugDuplicate = duplicateError('tags_slug_UK');
    assert.deepEqual(
      await repository.update(
        { id: 42, ...writeInput },
        createConnection([], [throwResponse(slugDuplicate)])
      ),
      { status: 'slug_taken' }
    );

    const unexpected = new Error('database unavailable');
    await assert.rejects(
      () => repository.create(writeInput, createConnection([], [throwResponse(unexpected)])),
      (error: unknown) => error === unexpected
    );
  });

  it('returns every restore outcome and preserves non-normalization conflicts', async () => {
    const repository = new AdminTagRepositoryMysql({} as Pool);

    assert.equal(
      await repository.restore(42, createConnection([], [[{ affectedRows: 1 }, []]])),
      'restored'
    );
    assert.equal(
      await repository.restore(42, createConnection([], [[{ affectedRows: 0 }, []]])),
      'not_updated'
    );
    assert.equal(
      await repository.restore(
        42,
        createConnection([], [throwResponse(duplicateError('tags_active_normalized_name_UK'))])
      ),
      'normalized_name_taken'
    );

    const slugDuplicate = duplicateError('tags_slug_UK');
    await assert.rejects(
      () => repository.restore(42, createConnection([], [throwResponse(slugDuplicate)])),
      (error: unknown) => error === slugDuplicate
    );
  });
});

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
      if (isThrowResponse(response))
        throw response.error;

      return response;
    }
  } as unknown as PoolConnection;
}

function duplicateError(indexName: string): Error & { code: string } {
  return Object.assign(new Error(`Duplicate entry for key '${indexName}'`), {
    code: 'ER_DUP_ENTRY'
  });
}

function throwResponse(error: unknown): { error: unknown } {
  return { error };
}

function isThrowResponse(response: unknown): response is { error: unknown } {
  return typeof response === 'object' && response !== null && 'error' in response;
}
