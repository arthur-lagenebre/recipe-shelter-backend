import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapRecipe, mapRecipeDetail, mapRecipeDetailComment, mapRecipeDetailComments, mapRecipeDetailEquipment, mapRecipeDetailIngredient, mapRecipeDetailStep, mapRecipeDetailTag, mapRecipeEquipment, mapRecipeIngredient, mapRecipeListItem, mapRecipeStep, mapRecipeSummary } from '../../../src/repositories/recipes/recipe.mapper.js';

import type { RecipeDetailCommentRow, RecipeDetailEquipmentRow, RecipeDetailIngredientRow, RecipeDetailRow, RecipeDetailStepRow, RecipeDetailTagRow, RecipeEquipmentRow, RecipeIngredientRow, RecipeListItemRow, RecipeRow, RecipeStepRow } from '../../../src/repositories/recipes/recipe.types.js';

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

const recipeRow = {
    Id: 1,
    UserId: 2,
    CategoryId: 3,
    Title: 'Cake maison',
    Slug: 'cake-maison',
    Description: 'Simple et bon',
    RecipeCoverImage: null,
    PrepTimeMinutes: 15,
    RestTimeMinutes: null,
    CookTimeMinutes: 45,
    Servings: 6,
    Status: 'draft',
    CreatedAt: new Date('2026-05-09T10:00:00.000Z'),
    SubmittedAt: null,
    ModeratedAt: null,
    ModeratedByUserId: null,
    PublishedAt: null,
    ArchivedAt: null,
    RejectionReason: null,
    UpdatedAt: new Date('2026-05-10T10:00:00.000Z')
} as RecipeRow;

describe('recipe.mapper', () => {
    it('maps editable recipe rows with empty nested collections', () => {
        const result = mapRecipe(recipeRow);

        assert.deepEqual(result, {
            id: 1,
            userId: 2,
            categoryId: 3,
            title: 'Cake maison',
            slug: 'cake-maison',
            description: 'Simple et bon',
            coverImageUrl: null,
            prepTimeMinutes: 15,
            restTimeMinutes: null,
            cookTimeMinutes: 45,
            servings: 6,
            status: 'draft',
            createdAt: recipeRow.CreatedAt,
            submittedAt: null,
            moderatedAt: null,
            moderatedByUserId: null,
            publishedAt: null,
            archivedAt: null,
            rejectionReason: null,
            updatedAt: recipeRow.UpdatedAt,
            tagIds: [],
            ingredients: [],
            steps: [],
            equipments: []
        });
    });

    it('maps recipe summaries', () => {
        assert.deepEqual(mapRecipeSummary(recipeRow), {
            id: 1,
            title: 'Cake maison',
            slug: 'cake-maison',
            description: 'Simple et bon',
            status: 'draft',
            createdAt: recipeRow.CreatedAt,
            submittedAt: null,
            publishedAt: null,
            rejectionReason: null,
            updatedAt: recipeRow.UpdatedAt
        });
    });

    it('maps recipe nested edit rows', () => {
        assert.deepEqual(mapRecipeIngredient({ IngredientId: 7, Quantity: '2.5', Unit: 'kg', Note: null, SortOrder: 1 } as RecipeIngredientRow), {
            ingredientId: 7,
            quantity: 2.5,
            unit: 'kg',
            note: null,
            sortOrder: 1
        });
        assert.deepEqual(mapRecipeStep({ StepNumber: 2, Description: 'Bake' } as RecipeStepRow), { stepNumber: 2, description: 'Bake' });
        assert.deepEqual(mapRecipeEquipment({ EquipmentId: 4 } as RecipeEquipmentRow), { equipmentId: 4 });
    });

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

    it('maps recipe detail nested rows', () => {
        assert.deepEqual(mapRecipeDetailIngredient({ Id: 7, IngredientId: 7, Name: 'Farine', Slug: 'farine', Quantity: '250', Unit: 'g', Note: 'T55', SortOrder: 1 } as RecipeDetailIngredientRow), {
            id: 7,
            name: 'Farine',
            slug: 'farine',
            quantity: 250,
            unit: 'g',
            note: 'T55',
            sortOrder: 1
        });
        assert.deepEqual(mapRecipeDetailStep({ StepNumber: 1, Description: 'Melanger' } as RecipeDetailStepRow), { stepNumber: 1, description: 'Melanger' });
        assert.deepEqual(mapRecipeDetailEquipment({ Id: 3, Name: 'Four', Slug: 'four' } as RecipeDetailEquipmentRow), { id: 3, name: 'Four', slug: 'four' });
        assert.deepEqual(mapRecipeDetailTag({ Id: 5, Name: 'Dessert', Slug: 'dessert' } as RecipeDetailTagRow), { id: 5, name: 'Dessert', slug: 'dessert' });
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

    it('masks deleted and moderated recipe detail comments', () => {
        const deletedAt = new Date('2026-05-10T10:00:00.000Z');
        const moderatedAt = new Date('2026-05-11T10:00:00.000Z');

        const deleted = mapRecipeDetailComment({
            Id: 8,
            AuthorId: 21,
            AuthorUsername: 'john',
            ParentCommentId: null,
            ModeratedAt: null,
            DeletedAt: deletedAt,
            Rating: 5,
            Comment: 'Original',
            CreatedAt: new Date('2026-05-09T10:00:00.000Z'),
            UpdatedAt: new Date('2026-05-09T10:00:00.000Z')
        } as RecipeDetailCommentRow);
        const moderated = mapRecipeDetailComment({
            Id: 9,
            AuthorId: 22,
            AuthorUsername: 'moderated',
            ParentCommentId: null,
            ModeratedAt: moderatedAt,
            DeletedAt: null,
            Rating: null,
            Comment: 'Original',
            CreatedAt: new Date('2026-05-09T10:00:00.000Z'),
            UpdatedAt: new Date('2026-05-09T10:00:00.000Z')
        } as RecipeDetailCommentRow);

        assert.equal(deleted.isDeleted, true);
        assert.match(deleted.comment, /supprim/);
        assert.equal(moderated.isModerated, true);
        assert.match(moderated.comment, /masqu/);
    });

    it('builds a recipe detail comment tree', () => {
        const rows = [
            {
                Id: 1,
                AuthorId: 20,
                AuthorUsername: 'root',
                ParentCommentId: null,
                ModeratedAt: null,
                DeletedAt: null,
                Rating: 5,
                Comment: 'Root',
                CreatedAt: new Date('2026-05-09T10:00:00.000Z'),
                UpdatedAt: new Date('2026-05-09T10:00:00.000Z')
            },
            {
                Id: 2,
                AuthorId: 21,
                AuthorUsername: 'child',
                ParentCommentId: 1,
                ModeratedAt: null,
                DeletedAt: null,
                Rating: null,
                Comment: 'Child',
                CreatedAt: new Date('2026-05-09T10:00:00.000Z'),
                UpdatedAt: new Date('2026-05-09T10:00:00.000Z')
            }
        ] as RecipeDetailCommentRow[];

        const result = mapRecipeDetailComments(rows);

        assert.equal(result.length, 1);
        assert.equal(result[0]?.children[0]?.comment, 'Child');
    });
});
