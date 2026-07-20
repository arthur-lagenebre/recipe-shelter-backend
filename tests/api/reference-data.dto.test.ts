import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCategoryIdParam } from '../../src/api/categories/categories.dto.js';
import { parseEquipmentIdParam } from '../../src/api/equipments/equipments.dto.js';
import { parseRecipeIdParam } from '../../src/api/favorites/favorites.dto.js';
import { parseIngredientIdParam } from '../../src/api/ingredients/ingredients.dto.js';
import { parseTagIdParam } from '../../src/api/tags/tags.dto.js';
import { HttpError } from '../../src/utils/errors.js';

type IdParserCase = {
    name: string;
    parser: (value: unknown) => number;
    errorCode: string;
};

const cases: IdParserCase[] = [
    { name: 'category', parser: parseCategoryIdParam, errorCode: 'CATEGORY_BAD_ID' },
    { name: 'equipment', parser: parseEquipmentIdParam, errorCode: 'EQUIPMENT_BAD_ID' },
    { name: 'favorite recipe', parser: parseRecipeIdParam, errorCode: 'RECIPE_BAD_ID' },
    { name: 'ingredient', parser: parseIngredientIdParam, errorCode: 'INGREDIENT_BAD_ID' },
    { name: 'tag', parser: parseTagIdParam, errorCode: 'TAG_BAD_ID' }
];

describe('reference data id DTOs', () => {
    for (const testCase of cases) {
        it(`parses a positive ${testCase.name} id`, () => {
            assert.equal(testCase.parser('42'), 42);
        });

        it(`rejects invalid ${testCase.name} ids`, () => {
            for (const invalidValue of [undefined, null, 42, '', '0', '-1', '1.5', 'abc']) {
                assert.throws(
                    () => testCase.parser(invalidValue),
                    (error) => {
                        assert.ok(error instanceof HttpError);
                        assert.equal(error.statusCode, 400);
                        assert.equal(error.code, testCase.errorCode);

                        return true;
                    }
                );
            }
        });
    }
});
