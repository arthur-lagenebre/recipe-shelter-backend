import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCreateRecipeBody, parseRecipeFeedLimitQuery, parseRecipeIdParam, parseRecipeSearchQuery, parseRecipeSlugParam, parseUpdateRecipeBody } from '../../../src/api/recipes/recipes.dto.js';
import { HttpError } from '../../../src/utils/errors.js';

function assertHttpError(error: unknown, code: string, status: number): void {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
}

describe('recipes.dto', () => {
    it('parses a complete create recipe body', () => {
        const result = parseCreateRecipeBody({
            categoryId: 2,
            title: '  Tarte aux pommes  ',
            description: '  Simple et bonne.  ',
            prepTimeMinutes: 20,
            restTimeMinutes: null,
            cookTimeMinutes: 35,
            servings: 6,
            tagIds: [1, 2],
            ingredients: [{ ingredientId: 7, quantity: 2, unit: ' pcs ', note: '  golden  ', sortOrder: 3 }],
            steps: [{ description: '  Couper les pommes.  ' }],
            equipments: [{ equipmentId: 4 }]
        });

        assert.deepEqual(result, {
            categoryId: 2,
            title: 'Tarte aux pommes',
            description: 'Simple et bonne.',
            prepTimeMinutes: 20,
            restTimeMinutes: null,
            cookTimeMinutes: 35,
            servings: 6,
            tagIds: [1, 2],
            ingredients: [{ ingredientId: 7, quantity: 2, unit: 'pcs', note: 'golden', sortOrder: 3 }],
            steps: [{ stepNumber: undefined, description: 'Couper les pommes.' }],
            equipments: [{ equipmentId: 4 }]
        });
    });

    it('parses an update recipe body with nullable fields', () => {
        const result = parseUpdateRecipeBody({
            title: '  Soupe maison  ',
            categoryId: null,
            tagIds: null,
            ingredients: null
        });

        assert.deepEqual(result, {
            categoryId: null,
            title: 'Soupe maison',
            description: undefined,
            prepTimeMinutes: undefined,
            restTimeMinutes: undefined,
            cookTimeMinutes: undefined,
            servings: undefined,
            tagIds: undefined,
            ingredients: undefined,
            steps: undefined,
            equipments: undefined
        });
    });

    it('rejects invalid recipe content bodies', () => {
        assert.throws(
            () => parseCreateRecipeBody(null),
            (error) => {
                assertHttpError(error, 'RECIPES_CREATE_BAD_BODY', 400);
                return true;
            }
        );

        assert.throws(
            () => parseCreateRecipeBody({ title: 'Tiny' }),
            (error) => {
                assertHttpError(error, 'RECIPES_CREATE_WEAK_TITLE', 400);
                return true;
            }
        );

        assert.throws(
            () => parseUpdateRecipeBody({ title: 'Valid title', tagIds: [1, 0] }),
            (error) => {
                assertHttpError(error, 'RECIPES_CREATE_BAD_TAG_ID', 400);
                return true;
            }
        );
    });

    it('rejects invalid nested recipe arrays', () => {
        assert.throws(
            () => parseCreateRecipeBody({ title: 'Valid title', ingredients: ['flour'] }),
            (error) => {
                assertHttpError(error, 'RECIPES_CREATE_BAD_INGREDIENT', 400);
                return true;
            }
        );

        assert.throws(
            () => parseCreateRecipeBody({ title: 'Valid title', steps: [{ description: '' }] }),
            (error) => {
                assertHttpError(error, 'RECIPES_CREATE_BAD_STEP_DESCRIPTION', 400);
                return true;
            }
        );

        assert.throws(
            () => parseCreateRecipeBody({ title: 'Valid title', equipments: [{ equipmentId: '4' }] }),
            (error) => {
                assertHttpError(error, 'RECIPES_CREATE_BAD_EQUIPMENT_ID', 400);
                return true;
            }
        );
    });

    it('parses and validates recipe id and slug params', () => {
        assert.equal(parseRecipeIdParam('42'), 42);
        assert.equal(parseRecipeSlugParam('  tarte-aux-pommes  '), 'tarte-aux-pommes');

        assert.throws(
            () => parseRecipeIdParam('0'),
            (error) => {
                assertHttpError(error, 'RECIPES_BAD_ID', 400);
                return true;
            }
        );

        assert.throws(
            () => parseRecipeSlugParam(' '),
            (error) => {
                assertHttpError(error, 'RECIPES_BAD_SLUG', 400);
                return true;
            }
        );
    });

    it('uses the default feed limit when omitted', () => {
        assert.equal(parseRecipeFeedLimitQuery({}), 12);
    });

    it('parses a feed limit', () => {
        assert.equal(parseRecipeFeedLimitQuery({ limit: '8' }), 8);
    });

    it('caps feed limit to 20', () => {
        assert.equal(parseRecipeFeedLimitQuery({ limit: '50' }), 20);
    });

    it('rejects an invalid feed limit', () => {
        assert.throws(
            () => parseRecipeFeedLimitQuery({ limit: '0' }),
            (error) => {
                assertHttpError(error, 'RECIPES_FEED_BAD_LIMIT', 400);

                return true;
            }
        );
    });

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

    it('parses and deduplicates comma-separated exclusion filters', () => {
        assert.deepEqual(parseRecipeSearchQuery({ excludedTagIds: '8, 9,8', excludedIngredientIds: '10, 11,10' }), {
            excludedTagIds: [8, 9],
            excludedIngredientIds: [10, 11]
        });
    });

    it('accepts an omitted or null ingredient quantity', () => {
        assert.deepEqual(
            parseCreateRecipeBody({
                title: 'Thé maison',
                ingredients: [
                    { ingredientId: 7 },
                    { ingredientId: 8, quantity: null }
                ]
            }).ingredients,
            [
                { ingredientId: 7, quantity: undefined, unit: undefined, note: undefined, sortOrder: undefined },
                { ingredientId: 8, quantity: null, unit: undefined, note: undefined, sortOrder: undefined }
            ]
        );
    });

    it('rejects a non-numeric ingredient quantity', () => {
        assert.throws(
            () => parseCreateRecipeBody({ title: 'Thé maison', ingredients: [{ ingredientId: 7, quantity: 'two' }] }),
            (error) => {
                assertHttpError(error, 'RECIPES_CREATE_BAD_INGREDIENT_QUANTITY', 400);
                return true;
            }
        );
    });

    it('parses a max total time filter', () => {
        assert.deepEqual(parseRecipeSearchQuery({ maxTotalTimeMinutes: '45' }), { maxTotalTimeMinutes: 45 });
    });

    it('combines title search, category, included and excluded relations, and total time filters', () => {
        assert.deepEqual(parseRecipeSearchQuery({ q: 'porc', categoryId: '3', tagIds: '1,2', excludedTagIds: '8', ingredientIds: '18,103', excludedIngredientIds: '10,11', maxTotalTimeMinutes: '60' }), {
            q: 'porc',
            categoryId: 3,
            tagIds: [1, 2],
            excludedTagIds: [8],
            ingredientIds: [18, 103],
            excludedIngredientIds: [10, 11],
            maxTotalTimeMinutes: 60
        });
    });

    it('ignores pagination keys in a search query', () => {
        assert.deepEqual(parseRecipeSearchQuery({ q: ' porc ', page: '2', limit: '12' }), { q: 'porc' });
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

    it('rejects malformed or non-positive exclusion lists', () => {
        assert.throws(
            () => parseRecipeSearchQuery({ excludedTagIds: '8,,9' }),
            (error) => {
                assertHttpError(error, 'RECIPES_SEARCH_BAD_EXCLUDED_TAGS', 400);

                return true;
            }
        );

        assert.throws(
            () => parseRecipeSearchQuery({ excludedIngredientIds: '0,11' }),
            (error) => {
                assertHttpError(error, 'RECIPES_SEARCH_BAD_EXCLUDED_INGREDIENTS', 400);

                return true;
            }
        );
    });

    it('rejects malformed inclusion lists instead of silently discarding empty entries', () => {
        assert.throws(
            () => parseRecipeSearchQuery({ tagIds: '1,' }),
            (error) => {
                assertHttpError(error, 'RECIPES_SEARCH_BAD_TAGS', 400);

                return true;
            }
        );
    });

    it('rejects tag ids that are both included and excluded', () => {
        assert.throws(
            () => parseRecipeSearchQuery({ tagIds: '1,2', excludedTagIds: '8,2' }),
            (error) => {
                assertHttpError(error, 'RECIPES_SEARCH_TAG_FILTER_CONFLICT', 400);

                return true;
            }
        );
    });

    it('rejects ingredient ids that are both included and excluded', () => {
        assert.throws(
            () => parseRecipeSearchQuery({ ingredientIds: '4,5', excludedIngredientIds: '5,10' }),
            (error) => {
                assertHttpError(error, 'RECIPES_SEARCH_INGREDIENT_FILTER_CONFLICT', 400);

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
