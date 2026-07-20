import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { CatalogProposalService } from '../../../src/services/catalog/catalog-proposals.service.js';
import { HttpError } from '../../../src/utils/errors.js';

import type { CatalogProposalRepository } from '../../../src/repositories/catalog/catalog-proposals.repository.interface.js';
import type { CatalogProposal, CatalogProposalType, CatalogProposalWriteResult, CreateCatalogProposalInput } from '../../../src/repositories/catalog/catalog-proposals.types.js';

const proposal: CatalogProposal = {
  id: 91,
  authorUserId: 7,
  recipeId: 42,
  proposalType: 'tag',
  proposedName: 'Cuisine solaire',
  normalizedName: 'cuisine solaire',
  status: 'pending',
  matchedTagId: null,
  matchedIngredientId: null,
  reviewedByStaffUserId: null,
  reviewReason: null,
  createdAt: new Date('2026-07-20T12:00:00.000Z'),
  reviewedAt: null
};

class FakeCatalogProposalRepository implements CatalogProposalRepository {
  recipeExists = true;
  canonicalNameExists = false;
  createResult: CatalogProposalWriteResult = { status: 'created', proposal };
  recipeLookup: { recipeId: number; authorUserId: number } | null = null;
  catalogLookup: { proposalType: CatalogProposalType; normalizedName: string } | null = null;
  createInput: CreateCatalogProposalInput | null = null;

  async recipeExistsForAuthor(recipeId: number, authorUserId: number): Promise<boolean> {
    this.recipeLookup = { recipeId, authorUserId };
    return this.recipeExists;
  }

  async activeCatalogNameExists(proposalType: CatalogProposalType, normalizedName: string): Promise<boolean> {
    this.catalogLookup = { proposalType, normalizedName };
    return this.canonicalNameExists;
  }

  async create(input: CreateCatalogProposalInput): Promise<CatalogProposalWriteResult> {
    this.createInput = input;
    return this.createResult;
  }
}

function assertHttpError(error: unknown, status: number, code: string): boolean {
  assert.ok(error instanceof HttpError);
  assert.equal(error.statusCode, status);
  assert.equal(error.code, code);
  return true;
}

describe('CatalogProposalService', () => {
  let repository: FakeCatalogProposalRepository;
  let service: CatalogProposalService;

  beforeEach(() => {
    repository = new FakeCatalogProposalRepository();
    service = new CatalogProposalService(repository);
  });

  it('normalizes and creates a tag proposal for the recipe author', async () => {
    assert.equal(await service.createTagProposal({
      authorUserId: 7,
      recipeId: 42,
      name: '  CUISINE---SOLAIRE!!!  '
    }), proposal);
    assert.deepEqual(repository.recipeLookup, { recipeId: 42, authorUserId: 7 });
    assert.deepEqual(repository.catalogLookup, { proposalType: 'tag', normalizedName: 'cuisine solaire' });
    assert.deepEqual(repository.createInput, {
      authorUserId: 7,
      recipeId: 42,
      proposalType: 'tag',
      proposedName: 'CUISINE---SOLAIRE!!!',
      normalizedName: 'cuisine solaire'
    });
  });

  it('uses ingredient normalization for ingredient proposals', async () => {
    repository.createResult = {
      status: 'created',
      proposal: { ...proposal, proposalType: 'ingredient', proposedName: 'Creme fraiche', normalizedName: 'creme fraiche' }
    };

    await service.createIngredientProposal({ authorUserId: 7, recipeId: 42, name: 'Crème fraîche' });

    assert.deepEqual(repository.catalogLookup, { proposalType: 'ingredient', normalizedName: 'creme fraiche' });
    assert.equal(repository.createInput?.proposalType, 'ingredient');
  });

  it('does not expose recipes that are absent or belong to another author', async () => {
    repository.recipeExists = false;

    await assert.rejects(
      () => service.createTagProposal({ authorUserId: 7, recipeId: 404, name: 'New tag' }),
      (error) => assertHttpError(error, 404, 'CATALOG_PROPOSALS_RECIPE_NOT_FOUND')
    );
    assert.equal(repository.catalogLookup, null);
    assert.equal(repository.createInput, null);
  });

  it('rejects names already used by the active canonical catalogue', async () => {
    repository.canonicalNameExists = true;

    await assert.rejects(
      () => service.createIngredientProposal({ authorUserId: 7, recipeId: 42, name: 'Known ingredient' }),
      (error) => assertHttpError(error, 409, 'CATALOG_PROPOSALS_CANONICAL_NAME_EXISTS')
    );
    assert.equal(repository.createInput, null);
  });

  it('maps a concurrent pending duplicate to a stable conflict', async () => {
    repository.createResult = { status: 'pending_duplicate' };

    await assert.rejects(
      () => service.createTagProposal({ authorUserId: 7, recipeId: 42, name: 'Pending tag' }),
      (error) => assertHttpError(error, 409, 'CATALOG_PROPOSALS_ALREADY_PENDING')
    );
  });

  it('defensively validates ids, lengths and normalized content', async () => {
    const invalidCommands = [
      { input: null, code: 'CATALOG_PROPOSALS_BAD_BODY' },
      { input: 'invalid command', code: 'CATALOG_PROPOSALS_BAD_BODY' },
      { input: { authorUserId: 0, recipeId: 42, name: 'Name' }, code: 'CATALOG_PROPOSALS_BAD_AUTHOR_ID' },
      { input: { authorUserId: 7, recipeId: Number.MAX_SAFE_INTEGER + 1, name: 'Name' }, code: 'CATALOG_PROPOSALS_BAD_RECIPE_ID' },
      { input: { authorUserId: 7, recipeId: 42, name: 123 }, code: 'CATALOG_PROPOSALS_NAME_REQUIRED' },
      { input: { authorUserId: 7, recipeId: 42, name: ' ' }, code: 'CATALOG_PROPOSALS_NAME_REQUIRED' },
      { input: { authorUserId: 7, recipeId: 42, name: 'a'.repeat(256) }, code: 'CATALOG_PROPOSALS_NAME_TOO_LONG' },
      { input: { authorUserId: 7, recipeId: 42, name: '---!!!' }, code: 'CATALOG_PROPOSALS_NAME_INVALID' },
      { input: { authorUserId: 7, recipeId: 42, name: 'œ'.repeat(128) }, code: 'CATALOG_PROPOSALS_NAME_TOO_LONG' }
    ];

    for (const { input, code } of invalidCommands) {
      await assert.rejects(
        () => service.createTagProposal(input as never),
        (error) => assertHttpError(error, 400, code)
      );
    }
    assert.equal(repository.recipeLookup, null);
  });
});
