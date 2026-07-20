import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapCatalogProposal } from '../../../src/repositories/catalog/catalog-proposals.mapper.js';
import { CatalogProposalRepositoryMysql } from '../../../src/repositories/catalog/catalog-proposals.repository.mysql.js';

import type { CatalogProposalRow } from '../../../src/repositories/catalog/catalog-proposals.types.js';
import type { Pool } from 'mysql2/promise';

const createdAt = new Date('2026-07-20T12:00:00.000Z');
const proposalRow = {
  Id: 91,
  AuthorUserId: 7,
  RecipeId: 42,
  ProposalType: 'tag',
  ProposedName: 'Cuisine solaire',
  NormalizedName: 'cuisine solaire',
  Status: 'pending',
  MatchedTagId: null,
  MatchedIngredientId: null,
  ReviewedByStaffUserId: null,
  ReviewReason: null,
  CreatedAt: createdAt,
  ReviewedAt: null
} as CatalogProposalRow;

type Statement = { sql: string; params: unknown };
type Response = unknown | { error: unknown };

function createPool(statements: Statement[], responses: Response[]): Pool {
  return {
    async execute(sql: string, params: unknown) {
      statements.push({ sql, params });
      const response = responses.shift();

      if (response && typeof response === 'object' && 'error' in response)
        throw response.error;
      if (response === undefined)
        throw new Error('Missing fake database response');

      return response;
    }
  } as unknown as Pool;
}

function duplicateError(indexName: string): Error & { code: string } {
  return Object.assign(new Error(`Duplicate entry for key '${indexName}'`), { code: 'ER_DUP_ENTRY' });
}

describe('CatalogProposalRepositoryMysql', () => {
  it('checks recipe ownership without exposing other recipes', async () => {
    const statements: Statement[] = [];
    const repository = new CatalogProposalRepositoryMysql(createPool(statements, [
      [[{ Exists: 1 }], []],
      [[{ Exists: 0 }], []]
    ]));

    assert.equal(await repository.recipeExistsForAuthor(42, 7), true);
    assert.equal(await repository.recipeExistsForAuthor(43, 7), false);
    assert.match(statements[0]?.sql ?? '', /WHERE Id = \? AND UserId = \?/);
    assert.deepEqual(statements[0]?.params, [42, 7]);
  });

  it('checks active tag names and both canonical and alias ingredient names', async () => {
    const statements: Statement[] = [];
    const repository = new CatalogProposalRepositoryMysql(createPool(statements, [
      [[{ Exists: 1 }], []],
      [[{ Exists: 0 }], []]
    ]));

    assert.equal(await repository.activeCatalogNameExists('tag', 'known tag'), true);
    assert.equal(await repository.activeCatalogNameExists('ingredient', 'known alias'), false);
    assert.match(statements[0]?.sql ?? '', /FROM Tags/);
    assert.deepEqual(statements[0]?.params, ['known tag']);
    assert.match(statements[1]?.sql ?? '', /FROM IngredientAliases/);
    assert.match(statements[1]?.sql ?? '', /ingredient\.Status = 'active'/);
    assert.deepEqual(statements[1]?.params, ['known alias', 'known alias']);
  });

  it('creates and reloads a pending proposal', async () => {
    const statements: Statement[] = [];
    const repository = new CatalogProposalRepositoryMysql(createPool(statements, [
      [{ insertId: 91, affectedRows: 1 }, []],
      [[proposalRow], []]
    ]));
    const result = await repository.create({
      authorUserId: 7,
      recipeId: 42,
      proposalType: 'tag',
      proposedName: 'Cuisine solaire',
      normalizedName: 'cuisine solaire'
    });

    assert.deepEqual(result, { status: 'created', proposal: mapCatalogProposal(proposalRow) });
    assert.match(statements[0]?.sql ?? '', /^INSERT INTO CatalogProposals/);
    assert.deepEqual(statements[0]?.params, [7, 42, 'tag', 'Cuisine solaire', 'cuisine solaire']);
    assert.deepEqual(statements[1]?.params, [91]);
  });

  it('maps only the pending proposal unique constraint to a duplicate outcome', async () => {
    const input = {
      authorUserId: 7,
      recipeId: 42,
      proposalType: 'tag' as const,
      proposedName: 'Cuisine solaire',
      normalizedName: 'cuisine solaire'
    };
    const duplicateRepository = new CatalogProposalRepositoryMysql(createPool([], [
      { error: duplicateError('catalog_proposals_pending_recipe_name_UK') }
    ]));

    assert.deepEqual(await duplicateRepository.create(input), { status: 'pending_duplicate' });

    const unexpected = duplicateError('another_index');
    const unexpectedRepository = new CatalogProposalRepositoryMysql(createPool([], [{ error: unexpected }]));
    await assert.rejects(() => unexpectedRepository.create(input), (error) => error === unexpected);
  });

  it('fails defensively when a created proposal cannot be reloaded', async () => {
    const repository = new CatalogProposalRepositoryMysql(createPool([], [
      [{ insertId: 91, affectedRows: 1 }, []],
      [[], []]
    ]));

    await assert.rejects(() => repository.create({
      authorUserId: 7,
      recipeId: 42,
      proposalType: 'ingredient',
      proposedName: 'Poudre de lune',
      normalizedName: 'poudre de lune'
    }), /Catalog proposal created but cannot be reloaded/);
  });

  it('maps nullable and reviewed catalog proposal fields', () => {
    const reviewedAt = new Date('2026-07-20T13:00:00.000Z');
    const reviewedTag = mapCatalogProposal({
      ...proposalRow,
      Status: 'accepted',
      MatchedTagId: 12,
      ReviewedByStaffUserId: 2,
      ReviewReason: 'Accepted by catalogue staff.',
      ReviewedAt: reviewedAt
    } as CatalogProposalRow);

    assert.deepEqual(reviewedTag, {
      id: 91,
      authorUserId: 7,
      recipeId: 42,
      proposalType: 'tag',
      proposedName: 'Cuisine solaire',
      normalizedName: 'cuisine solaire',
      status: 'accepted',
      matchedTagId: 12,
      matchedIngredientId: null,
      reviewedByStaffUserId: 2,
      reviewReason: 'Accepted by catalogue staff.',
      createdAt,
      reviewedAt
    });

    const reviewedIngredient = mapCatalogProposal({
      ...proposalRow,
      ProposalType: 'ingredient',
      Status: 'merged',
      MatchedIngredientId: 13,
      ReviewedByStaffUserId: 2,
      ReviewReason: 'Merged by catalogue staff.',
      ReviewedAt: reviewedAt
    } as CatalogProposalRow);
    assert.equal(reviewedIngredient.matchedTagId, null);
    assert.equal(reviewedIngredient.matchedIngredientId, 13);
  });
});
