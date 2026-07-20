import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseAdminIngredientActionReasonBody, parseAdminIngredientAliasIdParam, parseAdminIngredientAliasListFilters, parseAdminIngredientIdParam, parseAdminIngredientListFilters, parseCreateAdminIngredientAliasBody, parseCreateAdminIngredientBody, parseMergeAdminIngredientBody, parseUpdateAdminIngredientAliasBody, parseUpdateAdminIngredientBody } from '../../../src/api/admin/admin.ingredients.dto.js';
import { HttpError } from '../../../src/utils/errors.js';

describe('admin ingredients DTO validation', () => {
  it('parses identifiers and paginated-list filters', () => {
    assert.equal(parseAdminIngredientIdParam('42'), 42);
    assert.equal(parseAdminIngredientAliasIdParam('7'), 7);
    assert.deepEqual(parseAdminIngredientListFilters({
      status: 'deprecated',
      q: '  crème  ',
      page: '2',
      limit: '25'
    }), { status: 'deprecated', q: 'crème' });
    assert.deepEqual(parseAdminIngredientAliasListFilters({
      languageCode: ' FR-ca ',
      q: '  pois  ',
      page: '1'
    }), { languageCode: 'fr-ca', q: 'pois' });
  });

  it('rejects malformed identifiers and filters with stable errors', () => {
    assert.throws(() => parseAdminIngredientIdParam('1.5'), matchesCode('ADMIN_INGREDIENTS_BAD_ID'));
    assert.throws(() => parseAdminIngredientAliasIdParam('0'), matchesCode('ADMIN_INGREDIENT_ALIASES_BAD_ID'));
    assert.throws(() => parseAdminIngredientListFilters([]), matchesCode('ADMIN_INGREDIENTS_BAD_QUERY'));
    assert.throws(() => parseAdminIngredientListFilters({ status: 'deleted' }), matchesCode('ADMIN_INGREDIENTS_BAD_STATUS'));
    assert.throws(() => parseAdminIngredientListFilters({ q: ' ' }), matchesCode('ADMIN_INGREDIENTS_BAD_SEARCH'));
    assert.throws(
      () => parseAdminIngredientAliasListFilters({ languageCode: 'fr_' }),
      matchesCode('ADMIN_INGREDIENT_ALIASES_LANGUAGE_CODE_INVALID')
    );
    assert.throws(
      () => parseAdminIngredientAliasListFilters({ q: 'x'.repeat(256) }),
      matchesCode('ADMIN_INGREDIENT_ALIASES_BAD_SEARCH')
    );
  });

  it('parses canonical ingredient create and partial update bodies', () => {
    assert.deepEqual(parseCreateAdminIngredientBody({
      name: '  Crème fraîche  ',
      slug: 'creme-fraiche'
    }), { name: 'Crème fraîche', slug: 'creme-fraiche' });
    assert.deepEqual(parseCreateAdminIngredientBody({ name: 'Tomate' }), { name: 'Tomate' });
    assert.deepEqual(parseUpdateAdminIngredientBody({ name: ' Tomate cœur de bœuf ' }), {
      name: 'Tomate cœur de bœuf'
    });
    assert.deepEqual(parseUpdateAdminIngredientBody({ slug: 'tomate-coeur-de-boeuf' }), {
      slug: 'tomate-coeur-de-boeuf'
    });
  });

  it('rejects invalid canonical ingredient bodies', () => {
    assert.throws(() => parseCreateAdminIngredientBody([]), matchesCode('ADMIN_INGREDIENTS_CREATE_BAD_BODY'));
    assert.throws(() => parseCreateAdminIngredientBody({ name: ' ' }), matchesCode('ADMIN_INGREDIENTS_NAME_REQUIRED'));
    assert.throws(
      () => parseCreateAdminIngredientBody({ name: 'Valid', slug: 'Not Valid' }),
      matchesCode('ADMIN_INGREDIENTS_SLUG_INVALID')
    );
    assert.throws(() => parseUpdateAdminIngredientBody({}), matchesCode('ADMIN_INGREDIENTS_UPDATE_EMPTY'));
    assert.throws(
      () => parseUpdateAdminIngredientBody({ name: 'x'.repeat(256) }),
      matchesCode('ADMIN_INGREDIENTS_NAME_TOO_LONG')
    );
  });

  it('requires meaningful lifecycle and merge reasons', () => {
    assert.equal(
      parseAdminIngredientActionReasonBody({ reason: '  Ingrédient devenu obsolète.  ' }, 'deprecate'),
      'Ingrédient devenu obsolète.'
    );
    assert.deepEqual(parseMergeAdminIngredientBody({
      targetIngredientId: 8,
      reason: '  Doublon de la référence canonique.  '
    }), {
      targetIngredientId: 8,
      reason: 'Doublon de la référence canonique.'
    });
    assert.throws(
      () => parseAdminIngredientActionReasonBody({ reason: 'court' }, 'restore'),
      matchesCode('ADMIN_INGREDIENTS_RESTORE_REASON_TOO_SHORT')
    );
    assert.throws(() => parseMergeAdminIngredientBody([]), matchesCode('ADMIN_INGREDIENTS_MERGE_BAD_BODY'));
    assert.throws(
      () => parseMergeAdminIngredientBody({ targetIngredientId: 0, reason: 'Motif suffisamment long.' }),
      matchesCode('ADMIN_INGREDIENTS_MERGE_BAD_TARGET_ID')
    );
  });

  it('parses alias creation and partial updates', () => {
    assert.deepEqual(parseCreateAdminIngredientAliasBody({
      name: '  Pois chiche  ',
      languageCode: ' FR '
    }), { name: 'Pois chiche', languageCode: 'fr' });
    assert.deepEqual(parseUpdateAdminIngredientAliasBody({ name: ' Garbanzo ' }), { name: 'Garbanzo' });
    assert.deepEqual(parseUpdateAdminIngredientAliasBody({ languageCode: 'ES-419' }), { languageCode: 'es-419' });
  });

  it('rejects invalid alias bodies', () => {
    assert.throws(
      () => parseCreateAdminIngredientAliasBody({ name: 'Pois chiche' }),
      matchesCode('ADMIN_INGREDIENT_ALIASES_LANGUAGE_CODE_INVALID')
    );
    assert.throws(
      () => parseCreateAdminIngredientAliasBody({ name: ' ', languageCode: 'fr' }),
      matchesCode('ADMIN_INGREDIENT_ALIASES_NAME_REQUIRED')
    );
    assert.throws(
      () => parseUpdateAdminIngredientAliasBody({}),
      matchesCode('ADMIN_INGREDIENT_ALIASES_UPDATE_EMPTY')
    );
    assert.throws(
      () => parseUpdateAdminIngredientAliasBody({ languageCode: 'f' }),
      matchesCode('ADMIN_INGREDIENT_ALIASES_LANGUAGE_CODE_INVALID')
    );
  });
});

function matchesCode(code: string) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, code);
    return true;
  };
}
