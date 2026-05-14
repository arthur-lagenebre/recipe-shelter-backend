import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseRecipeSearchQuery } from '../../../src/api/recipes/recipes.dto.js';
import { HttpError } from '../../../src/utils/errors.js';

function assertHttpError(error: unknown, code: string, status: number): void {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
}

describe('recipes.dto', () => {
    it('parses an empty search query', () => {
        assert.deepEqual(parseRecipeSearchQuery({}), {});
    });

    it('trims and parses a title search query', () => {
        assert.deepEqual(parseRecipeSearchQuery({ q: '  porc  ' }), { q: 'porc' });
    });

    it('ignores a blank title search query', () => {
        assert.deepEqual(parseRecipeSearchQuery({ q: '   ' }), {});
    });

    it('parses a category filter', () => {
        assert.deepEqual(parseRecipeSearchQuery({ categoryId: '3' }), { categoryId: 3 });
    });

    it('parses comma-separated tag filters', () => {
        assert.deepEqual(parseRecipeSearchQuery({ tagIds: '1, 2,2' }), { tagIds: [1, 2] });
    });

    it('parses comma-separated ingredient filters', () => {
        assert.deepEqual(parseRecipeSearchQuery({ ingredientIds: '18, 103,18' }), { ingredientIds: [18, 103] });
    });

    it('parses a max total time filter', () => {
        assert.deepEqual(parseRecipeSearchQuery({ maxTotalTimeMinutes: '45' }), { maxTotalTimeMinutes: 45 });
    });

    it('combines title search, category, tag, ingredient and total time filters', () => {
        assert.deepEqual(parseRecipeSearchQuery({ q: 'porc', categoryId: '3', tagIds: '1,2', ingredientIds: '18,103', maxTotalTimeMinutes: '60' }), {
            q: 'porc',
            categoryId: 3,
            tagIds: [1, 2],
            ingredientIds: [18, 103],
            maxTotalTimeMinutes: 60
        });
    });

    it('rejects an invalid category filter', () => {
        assert.throws(
            () => parseRecipeSearchQuery({ categoryId: 'abc' }),
            (error) => {
                assertHttpError(error, 'RECIPES_SEARCH_BAD_CATEGORY', 400);

                return true;
            }
        );
    });

    it('rejects invalid tag filters', () => {
        assert.throws(
            () => parseRecipeSearchQuery({ tagIds: '1,abc' }),
            (error) => {
                assertHttpError(error, 'RECIPES_SEARCH_BAD_TAGS', 400);

                return true;
            }
        );
    });

    it('rejects repeated tag filters', () => {
        assert.throws(
            () => parseRecipeSearchQuery({ tagIds: ['1', '2'] }),
            (error) => {
                assertHttpError(error, 'RECIPES_SEARCH_BAD_TAGS', 400);

                return true;
            }
        );
    });

    it('rejects invalid ingredient filters', () => {
        assert.throws(
            () => parseRecipeSearchQuery({ ingredientIds: '18,abc' }),
            (error) => {
                assertHttpError(error, 'RECIPES_SEARCH_BAD_INGREDIENTS', 400);

                return true;
            }
        );
    });

    it('rejects repeated ingredient filters', () => {
        assert.throws(
            () => parseRecipeSearchQuery({ ingredientIds: ['18', '103'] }),
            (error) => {
                assertHttpError(error, 'RECIPES_SEARCH_BAD_INGREDIENTS', 400);

                return true;
            }
        );
    });

    it('rejects an invalid max total time filter', () => {
        assert.throws(
            () => parseRecipeSearchQuery({ maxTotalTimeMinutes: '0' }),
            (error) => {
                assertHttpError(error, 'RECIPES_SEARCH_BAD_TOTAL_TIME', 400);

                return true;
            }
        );
    });
});
