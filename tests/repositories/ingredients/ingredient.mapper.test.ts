import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapIngredient } from '../../../src/repositories/ingredients/ingredient.mapper.js';

import type { IngredientRow } from '../../../src/repositories/ingredients/ingredient.types.js';

describe('ingredient.mapper', () => {
    it('maps the canonical identity, lifecycle and metadata', () => {
        const createdAt = new Date('2026-07-19T10:00:00.000Z');
        const updatedAt = new Date('2026-07-20T11:00:00.000Z');

        assert.deepEqual(mapIngredient({
            Id: 1,
            Name: 'Crème fraîche',
            NormalizedName: 'creme fraiche',
            Slug: 'creme-fraiche',
            Status: 'merged',
            MergedIntoIngredientId: 3,
            CreatedAt: createdAt,
            UpdatedAt: updatedAt
        } as IngredientRow), {
            id: 1,
            name: 'Crème fraîche',
            normalizedName: 'creme fraiche',
            slug: 'creme-fraiche',
            status: 'merged',
            mergedIntoIngredientId: 3,
            createdAt,
            updatedAt
        });
    });
});
