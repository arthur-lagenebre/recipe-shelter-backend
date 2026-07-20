import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCreateCatalogProposalBody } from '../../../src/api/catalog/catalog-proposals.dto.js';
import { HttpError } from '../../../src/utils/errors.js';

function assertBadRequest(error: unknown, code: string): boolean {
  assert.ok(error instanceof HttpError);
  assert.equal(error.statusCode, 400);
  assert.equal(error.code, code);
  return true;
}

describe('catalog-proposals.dto', () => {
  it('parses and trims a proposal body', () => {
    assert.deepEqual(parseCreateCatalogProposalBody({
      recipeId: 42,
      name: '  Cuisine solaire  '
    }), {
      recipeId: 42,
      name: 'Cuisine solaire'
    });
  });

  it('rejects malformed bodies and recipe ids', () => {
    assert.throws(
      () => parseCreateCatalogProposalBody([]),
      (error) => assertBadRequest(error, 'CATALOG_PROPOSALS_BAD_BODY')
    );
    assert.throws(
      () => parseCreateCatalogProposalBody({ recipeId: 0, name: 'Valid name' }),
      (error) => assertBadRequest(error, 'CATALOG_PROPOSALS_BAD_RECIPE_ID')
    );
  });

  it('rejects missing and oversized names', () => {
    assert.throws(
      () => parseCreateCatalogProposalBody({ recipeId: 42, name: '   ' }),
      (error) => assertBadRequest(error, 'CATALOG_PROPOSALS_NAME_REQUIRED')
    );
    assert.throws(
      () => parseCreateCatalogProposalBody({ recipeId: 42, name: 'a'.repeat(256) }),
      (error) => assertBadRequest(error, 'CATALOG_PROPOSALS_NAME_TOO_LONG')
    );
  });
});
