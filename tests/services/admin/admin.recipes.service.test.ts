import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { AdminRecipeService } from '../../../src/services/admin/admin.recipes.services.js';
import { HttpError } from '../../../src/utils/errors.js';

import type { AdminRecipeRepository } from '../../../src/repositories/admin/admin.recipe.repository.interface.js';
import type { RecipeAdmin, RecipePending } from '../../../src/repositories/admin/admin.recipe.types.js';
import type { RecipeImage } from '../../../src/repositories/recipe-images/recipe-image.types.js';
import type { RecipeRepository } from '../../../src/repositories/recipes/recipe.repository.interface.js';
import type { Recipe } from '../../../src/repositories/recipes/recipe.types.js';

const baseRecipe: Recipe = {
    id: 10,
    userId: 2,
    categoryId: 1,
    title: 'Cake',
    slug: 'cake',
    description: 'Good',
    coverImage: null,
    prepTimeMinutes: 15,
    restTimeMinutes: null,
    cookTimeMinutes: 45,
    servings: 6,
    status: 'pending',
    createdAt: new Date('2026-05-09T10:00:00.000Z'),
    submittedAt: new Date('2026-05-10T10:00:00.000Z'),
    moderatedAt: null,
    moderatedByUserId: null,
    publishedAt: null,
    archivedAt: null,
    rejectionReason: null,
    updatedAt: new Date('2026-05-10T10:00:00.000Z'),
    tagIds: [],
    ingredients: [],
    steps: [],
    equipments: []
};

const pendingRecipe: RecipePending = {
    id: 10,
    user: 'john',
    category: 'Dessert',
    title: 'Cake',
    slug: 'cake',
    description: 'Good',
    submittedAt: new Date('2026-05-10T10:00:00.000Z')
};

const adminRecipe: RecipeAdmin = {
    ...pendingRecipe,
    coverImage: null,
    prepTimeMinutes: 15,
    restTimeMinutes: null,
    cookTimeMinutes: 45,
    servings: 6,
    status: 'pending',
    createdAt: new Date('2026-05-09T10:00:00.000Z'),
    moderatedAt: null,
    moderatedByUserId: null,
    publishedAt: null,
    archivedAt: null,
    rejectionReason: null,
    updatedAt: new Date('2026-05-10T10:00:00.000Z'),
    tags: [],
    ingredients: [],
    steps: [],
    equipments: []
};

class FakeRecipeRepository implements Partial<RecipeRepository> {
    recipe: Recipe | null = baseRecipe;
    archivedId: number | null = null;

    async findById(): Promise<Recipe | null> {
        return this.recipe;
    }

    async archive(id: number): Promise<boolean> {
        this.archivedId = id;
        return true;
    }
}

class FakeAdminRecipeRepository implements AdminRecipeRepository {
    publishedInput: { id: number; adminUserId: number } | null = null;
    rejectedInput: { id: number; adminUserId: number; reason: string } | null = null;
    deletedId: number | null = null;
    recipeAdmin: RecipeAdmin | null = adminRecipe;

    async findPendingForAdmin(): Promise<RecipePending[]> {
        return [pendingRecipe];
    }

    async countPendingForAdmin(): Promise<number> {
        return 1;
    }

    async findByIdForAdmin(): Promise<RecipeAdmin | null> {
        return this.recipeAdmin;
    }

    async publish(id: number, adminUserId: number): Promise<boolean> {
        this.publishedInput = { id, adminUserId };
        return true;
    }

    async reject(id: number, adminUserId: number, reason: string): Promise<boolean> {
        this.rejectedInput = { id, adminUserId, reason };
        return true;
    }

    async delete(id: number): Promise<boolean> {
        this.deletedId = id;
        return true;
    }
}

function assertHttpError(error: unknown, code: string, status: number): boolean {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);

    return true;
}

describe('AdminRecipeService', () => {
    let recipes: FakeRecipeRepository;
    let adminRecipes: FakeAdminRecipeRepository;
    let service: AdminRecipeService;

    beforeEach(() => {
        recipes = new FakeRecipeRepository();
        adminRecipes = new FakeAdminRecipeRepository();
        service = new AdminRecipeService(recipes as unknown as RecipeRepository, adminRecipes);
    });

    it('lists, counts and gets recipes for admin', async () => {
        assert.deepEqual(await service.getPendingRecipesForAdmin(), [pendingRecipe]);
        assert.equal(await service.getCountPendingRecipesForAdmin(), 1);
        assert.deepEqual(await service.getRecipeForAdmin(10), adminRecipe);

        adminRecipes.recipeAdmin = null;
        await assert.rejects(() => service.getRecipeForAdmin(99), (error) => assertHttpError(error, 'RECIPES_NOT_FOUND', 404));
    });

    it('approves and rejects pending recipes', async () => {
        assert.equal(await service.approve(10, 1), true);
        assert.deepEqual(adminRecipes.publishedInput, { id: 10, adminUserId: 1 });

        assert.equal(await service.reject(10, 1, 'Missing details'), true);
        assert.deepEqual(adminRecipes.rejectedInput, { id: 10, adminUserId: 1, reason: 'Missing details' });
    });

    it('rejects moderation when recipe is missing or not pending', async () => {
        recipes.recipe = null;
        await assert.rejects(() => service.approve(10, 1), (error) => assertHttpError(error, 'RECIPES_NOT_FOUND', 404));

        recipes.recipe = { ...baseRecipe, status: 'draft' };
        await assert.rejects(() => service.reject(10, 1, 'Reason'), (error) => assertHttpError(error, 'RECIPES_MODERATE_FORBIDDEN', 403));
    });

    it('archives only published or rejected recipes and deletes existing recipes', async () => {
        recipes.recipe = { ...baseRecipe, status: 'published' };
        assert.equal(await service.archive(10), true);
        assert.equal(recipes.archivedId, 10);

        recipes.recipe = { ...baseRecipe, status: 'draft' };
        await assert.rejects(() => service.archive(10), (error) => assertHttpError(error, 'RECIPES_ARCHIVE_FORBIDDEN', 403));

        recipes.recipe = baseRecipe;
        assert.equal(await service.delete(10), true);
        assert.equal(adminRecipes.deletedId, 10);

        recipes.recipe = null;
        await assert.rejects(() => service.delete(99), (error) => assertHttpError(error, 'RECIPES_NOT_FOUND', 404));
    });

    it('cleans image objects only after a physical recipe deletion', async () => {
        const events: string[] = [];
        const image = {
            id: 'image-id',
            recipeId: 10,
            largeStorageKey: 'recipes/10/image-id/large.webp',
            mediumStorageKey: 'recipes/10/image-id/medium.webp',
            thumbnailStorageKey: 'recipes/10/image-id/thumbnail.webp',
            originalWidth: 100,
            originalHeight: 50,
            largeWidth: 100,
            largeHeight: 50,
            largeSizeBytes: 10,
            altText: null,
            createdAt: new Date(),
            updatedAt: new Date()
        } satisfies RecipeImage;
        const cleanup = {
            async findForCleanup() {
                events.push('image:read');
                return image;
            },
            async cleanupAfterRecipeDeletion() {
                events.push('storage:delete');
            }
        };
        adminRecipes.delete = async () => {
            events.push('db:delete');
            return true;
        };
        service = new AdminRecipeService(recipes as unknown as RecipeRepository, adminRecipes, cleanup);

        assert.equal(await service.delete(10), true);
        assert.deepEqual(events, ['image:read', 'db:delete', 'storage:delete']);
    });
});
