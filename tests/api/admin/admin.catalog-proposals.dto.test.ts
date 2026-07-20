import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseAcceptIngredientCatalogProposalBody, parseAcceptTagCatalogProposalBody, parseAdminCatalogProposalIdParam, parseAdminCatalogProposalListFilters, parseAssociateIngredientCatalogProposalBody, parseAssociateTagCatalogProposalBody, parseConvertCatalogProposalToAliasBody, parseRejectCatalogProposalBody } from '../../../src/api/admin/admin.catalog-proposals.dto.js';
import { HttpError } from '../../../src/utils/errors.js';

function assertBadRequest(error: unknown, code: string): boolean {
  assert.ok(error instanceof HttpError);
  assert.equal(error.statusCode, 400);
  assert.equal(error.code, code);
  return true;
}

describe('admin.catalog-proposals.dto', () => {
  it('defaults the staff queue to pending and parses cumulative filters', () => {
    assert.equal(parseAdminCatalogProposalIdParam('42'), 42);
    assert.deepEqual(parseAdminCatalogProposalListFilters({}), { status: 'pending' });
    assert.deepEqual(parseAdminCatalogProposalListFilters({
      status: 'merged',
      proposalType: 'ingredient',
      recipeId: '42',
      authorUserId: '7',
      q: '  poudre  '
    }), {
      status: 'merged',
      proposalType: 'ingredient',
      recipeId: 42,
      authorUserId: 7,
      q: 'poudre'
    });
  });

  it('parses typed accept bodies without accepting a canonical name', () => {
    assert.deepEqual(parseAcceptTagCatalogProposalBody({
      groupId: 8,
      name: 'Ignored free canonical name',
      slug: 'cuisine-solaire',
      description: '  Nouvelle cuisine.  ',
      reason: '  Proposition pertinente pour le catalogue.  '
    }), {
      groupId: 8,
      slug: 'cuisine-solaire',
      description: 'Nouvelle cuisine.',
      reason: 'Proposition pertinente pour le catalogue.'
    });
    assert.deepEqual(parseAcceptIngredientCatalogProposalBody({
      slug: 'poudre-de-lune',
      reason: 'Nouvel ingrédient canonique validé.'
    }), {
      slug: 'poudre-de-lune',
      reason: 'Nouvel ingrédient canonique validé.'
    });
    assert.deepEqual(parseAcceptTagCatalogProposalBody({
      groupId: 8,
      description: null,
      reason: 'Proposition pertinente pour le catalogue.'
    }), {
      groupId: 8,
      description: null,
      reason: 'Proposition pertinente pour le catalogue.'
    });
  });

  it('parses reject, association and alias decisions', () => {
    assert.equal(
      parseRejectCatalogProposalBody({ reason: 'Suggestion hors périmètre.' }),
      'Suggestion hors périmètre.'
    );
    assert.deepEqual(parseAssociateIngredientCatalogProposalBody({
      targetIngredientId: 12,
      reason: 'Correspond à un ingrédient existant.'
    }), {
      targetIngredientId: 12,
      reason: 'Correspond à un ingrédient existant.'
    });
    assert.deepEqual(parseAssociateTagCatalogProposalBody({
      targetTagId: 8,
      reason: 'Correspond à un tag existant.'
    }), {
      targetTagId: 8,
      reason: 'Correspond à un tag existant.'
    });
    assert.deepEqual(parseConvertCatalogProposalToAliasBody({
      targetIngredientId: 12,
      languageCode: ' FR ',
      reason: 'Variante utile comme alias français.'
    }), {
      targetIngredientId: 12,
      languageCode: 'fr',
      reason: 'Variante utile comme alias français.'
    });
  });

  it('rejects malformed ids, filters, metadata and mandatory reasons', () => {
    const invalidCases: Array<{ run: () => unknown; code: string }> = [
      { run: () => parseAdminCatalogProposalIdParam('0'), code: 'ADMIN_CATALOG_PROPOSALS_BAD_ID' },
      { run: () => parseAdminCatalogProposalListFilters({ status: 'unknown' }), code: 'ADMIN_CATALOG_PROPOSALS_BAD_STATUS' },
      { run: () => parseAdminCatalogProposalListFilters({ proposalType: 'equipment' }), code: 'ADMIN_CATALOG_PROPOSALS_BAD_TYPE' },
      { run: () => parseAdminCatalogProposalListFilters({ recipeId: '1.5' }), code: 'ADMIN_CATALOG_PROPOSALS_BAD_RECIPE_ID' },
      { run: () => parseAdminCatalogProposalListFilters({ q: 42 }), code: 'ADMIN_CATALOG_PROPOSALS_BAD_SEARCH' },
      { run: () => parseAcceptIngredientCatalogProposalBody([]), code: 'ADMIN_CATALOG_PROPOSALS_ACCEPT_BAD_BODY' },
      { run: () => parseAcceptTagCatalogProposalBody({ groupId: 0, reason: 'Motif suffisamment long.' }), code: 'ADMIN_CATALOG_PROPOSALS_BAD_TAG_GROUP_ID' },
      { run: () => parseAcceptTagCatalogProposalBody({ groupId: 1, slug: 'Bad Slug', reason: 'Motif suffisamment long.' }), code: 'ADMIN_CATALOG_PROPOSALS_TAG_SLUG_INVALID' },
      { run: () => parseAcceptTagCatalogProposalBody({ groupId: 1, description: 42, reason: 'Motif suffisamment long.' }), code: 'ADMIN_CATALOG_PROPOSALS_TAG_DESCRIPTION_INVALID' },
      { run: () => parseRejectCatalogProposalBody({ reason: 'court' }), code: 'ADMIN_CATALOG_PROPOSALS_REJECT_REASON_TOO_SHORT' },
      { run: () => parseRejectCatalogProposalBody({ reason: 'x'.repeat(1001) }), code: 'ADMIN_CATALOG_PROPOSALS_REJECT_REASON_TOO_LONG' },
      { run: () => parseConvertCatalogProposalToAliasBody({ targetIngredientId: 1, languageCode: 'fr_FR', reason: 'Motif suffisamment long.' }), code: 'ADMIN_CATALOG_PROPOSALS_ALIAS_LANGUAGE_CODE_INVALID' }
    ];

    for (const { run, code } of invalidCases)
      assert.throws(run, (error) => assertBadRequest(error, code));
  });
});
