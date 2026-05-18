import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapRecipeDetail, mapRecipeDetailComment, mapRecipeListItem } from '../../../src/repositories/recipes/recipe.mapper.js';

import type { RecipeDetailCommentRow, RecipeDetailRow, RecipeListItemRow } from '../../../src/repositories/recipes/recipe.types.js';

const listRow = {
    Id: 1,
    Title: 'Cake maison',
    Slug: 'cake-maison',
    Description: 'Simple et bon',
    RecipeCoverImage: null,
    Category: 'Dessert',
    PrepTimeMinutes: 15,
    RestTimeMinutes: null,
    CookTimeMinutes: 45,
    Servings: 6,
    AuthorUsername: 'arthur',
    PublishedAt: new Date('2026-05-09T10:00:00.000Z'),
    IsFavorite: false
} as RecipeListItemRow;

describe('recipe.mapper', () => {
    it('keeps recipe list items unchanged', () => {
        const result = mapRecipeListItem(listRow);

        assert.equal(result.authorUsername, 'arthur');
        assert.equal(Object.hasOwn(result, 'author'), false);
    });

    it('maps recipe detail with a nested author instead of authorUsername', () => {
        const result = mapRecipeDetail({
            ...listRow,
            AuthorId: 12
        } as RecipeDetailRow);

        assert.deepEqual(result.author, { id: 12, username: 'arthur' });
        assert.equal(Object.hasOwn(result, 'authorUsername'), false);
    });

    it('maps recipe detail comments with a nested author only', () => {
        const result = mapRecipeDetailComment({
            Id: 8,
            AuthorId: 21,
            AuthorUsername: 'john',
            ParentCommentId: null,
            ModeratedAt: null,
            DeletedAt: null,
            Rating: 5,
            Comment: 'Top',
            CreatedAt: new Date('2026-05-09T10:00:00.000Z'),
            UpdatedAt: new Date('2026-05-09T10:00:00.000Z')
        } as RecipeDetailCommentRow);

        assert.deepEqual(result.author, { id: 21, username: 'john' });
        assert.equal(Object.hasOwn(result, 'username'), false);
        assert.equal(Object.hasOwn(result, 'moderatedByUsername'), false);
    });
});
