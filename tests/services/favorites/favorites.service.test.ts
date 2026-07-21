import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { FavoriteService } from '../../../src/services/favorites/favorites.service.js';
import { HttpError } from '../../../src/utils/errors.js';

import type { FavoriteRepository } from '../../../src/repositories/favorite/favorite.repository.interface.js';
import type { Favorite } from '../../../src/repositories/favorite/favorite.types.js';
import type { RecipeRepository } from '../../../src/repositories/recipes/recipe.repository.interface.js';
import type { Recipe, RecipeDetail, RecipeListItem, RecipeSummary } from '../../../src/repositories/recipes/recipe.types.js';
import type { PaginatedResult, PaginationOptions } from '../../../src/utils/pagination.js';

const favorite: Favorite = {
    userId: 7,
    recipeId: 12,
    createdAt: new Date('2026-07-12T10:00:00.000Z')
};

const storedRecipe: Recipe = {
    id: 12,
    userId: 7,
    categoryId: 1,
    title: 'Summer salad',
    slug: 'summer-salad-draft',
    description: 'Fresh and quick',
    coverImage: null,
    prepTimeMinutes: 10,
    cookTimeMinutes: null,
    restTimeMinutes: null,
    servings: 2,
    status: 'draft',
    createdAt: new Date('2026-07-01T09:00:00.000Z'),
    submittedAt: null,
    moderatedAt: null,
    moderatedByUserId: null,
    publishedAt: null,
    archivedAt: null,
    rejectionReason: null,
    updatedAt: new Date('2026-07-01T09:00:00.000Z'),
    tagIds: [],
    ingredients: [],
    steps: [],
    equipments: []
};

const recipe: RecipeListItem = {
    id: 12,
    title: 'Summer salad',
    slug: 'summer-salad',
    description: 'Fresh and quick',
    category: 'Salads',
    coverImage: null,
    prepTimeMinutes: 10,
    cookTimeMinutes: null,
    restTimeMinutes: null,
    servings: 2,
    authorUsername: 'alice',
    publishedAt: new Date('2026-07-01T10:00:00.000Z'),
    isFavorite: true
};

const paginatedRecipes: PaginatedResult<RecipeListItem> = {
    items: [recipe],
    pagination: {
        page: 2,
        limit: 12,
        totalItems: 13,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true
    }
};

class FakeFavoriteRepository implements FavoriteRepository {
    createResult: Favorite | null = favorite;
    deleteResult = true;
    createInput: { userId: number; recipeId: number } | null = null;
    deleteInput: { userId: number; recipeId: number } | null = null;
    listInput: { userId: number; pagination: PaginationOptions } | null = null;

    async create(userId: number, recipeId: number): Promise<Favorite> {
        this.createInput = { userId, recipeId };
        return this.createResult as Favorite;
    }

    async delete(userId: number, recipeId: number): Promise<boolean> {
        this.deleteInput = { userId, recipeId };
        return this.deleteResult;
    }

    async getFavoriteRecipes(userId: number, pagination: PaginationOptions): Promise<PaginatedResult<RecipeListItem>> {
        this.listInput = { userId, pagination };
        return paginatedRecipes;
    }
}

class FakeRecipeRepository implements RecipeRepository {
    recipe: Recipe | null = storedRecipe;
    findByIdInput: number | null = null;

    async create(): Promise<Recipe> {
        throw new Error('Not implemented');
    }

    async updateDraft(): Promise<Recipe> {
        throw new Error('Not implemented');
    }

    async submit(): Promise<Recipe> {
        throw new Error('Not implemented');
    }

    async archive(): Promise<boolean> {
        return false;
    }

    async findById(id: number): Promise<Recipe | null> {
        this.findByIdInput = id;
        return this.recipe;
    }

    async findByUserId(): Promise<PaginatedResult<RecipeSummary>> {
        return { ...paginatedRecipes, items: [] };
    }

    async findPublished(): Promise<PaginatedResult<RecipeListItem>> {
        return paginatedRecipes;
    }

    async searchPublished(): Promise<PaginatedResult<RecipeListItem>> {
        return paginatedRecipes;
    }

    async findPublishedByAuthorId(): Promise<RecipeListItem[]> {
        return [];
    }

    async findRecentPublished(): Promise<RecipeListItem[]> {
        return [];
    }

    async findPublishedBySlug(): Promise<RecipeDetail | null> {
        return null;
    }

    async existsBySlug(): Promise<boolean> {
        return false;
    }
}

function assertHttpError(error: unknown, code: string, status = 500): boolean {
    assert.ok(error instanceof HttpError);
    assert.equal(error.statusCode, status);
    assert.equal(error.code, code);

    return true;
}

describe('FavoriteService', () => {
    let repository: FakeFavoriteRepository;
    let recipeRepository: FakeRecipeRepository;
    let service: FavoriteService;

    beforeEach(() => {
        repository = new FakeFavoriteRepository();
        recipeRepository = new FakeRecipeRepository();
        service = new FavoriteService(repository, recipeRepository);
    });

    it("creates a favorite for another user's published recipe", async () => {
        recipeRepository.recipe = { ...storedRecipe, userId: 8, status: 'published' };

        assert.deepEqual(await service.createFavorite(7, 12), favorite);
        assert.equal(recipeRepository.findByIdInput, 12);
        assert.deepEqual(repository.createInput, { userId: 7, recipeId: 12 });
    });

    it("creates a favorite for the authenticated user's own draft recipe", async () => {
        assert.deepEqual(await service.createFavorite(7, 12), favorite);
        assert.deepEqual(repository.createInput, { userId: 7, recipeId: 12 });
    });

    for (const status of ['draft', 'pending', 'rejected', 'archived']) {
        it(`rejects another user's ${status} recipe`, async () => {
            recipeRepository.recipe = { ...storedRecipe, userId: 8, status };

            await assert.rejects(() => service.createFavorite(7, 12), (error) => assertHttpError(error, 'RECIPES_ACCESS_DENIED', 403));
            assert.equal(repository.createInput, null);
        });
    }

    it('rejects a recipe that does not exist', async () => {
        recipeRepository.recipe = null;

        await assert.rejects(() => service.createFavorite(7, 12), (error) => assertHttpError(error, 'RECIPES_NOT_FOUND', 404));
        assert.equal(repository.createInput, null);
    });

    it('reports a repository creation failure', async () => {
        repository.createResult = null;

        await assert.rejects(() => service.createFavorite(7, 12), (error) => assertHttpError(error, 'FAVORITE_CANNOT_BE_CREATED'));
    });

    it('deletes a favorite without checking recipe visibility', async () => {
        recipeRepository.recipe = { ...storedRecipe, userId: 8, status: 'archived' };

        assert.equal(await service.deleteFavorite(7, 12), true);
        assert.deepEqual(repository.deleteInput, { userId: 7, recipeId: 12 });
        assert.equal(recipeRepository.findByIdInput, null);
    });

    it('reports a repository deletion failure', async () => {
        repository.deleteResult = false;

        await assert.rejects(() => service.deleteFavorite(7, 12), (error) => assertHttpError(error, 'FAVORITE_CANNOT_BE_DELETED'));
    });

    it('returns the paginated favorite recipes without altering pagination', async () => {
        const pagination = { page: 2, limit: 12, offset: 12 };

        assert.deepEqual(await service.getFavoriteRecipes(7, pagination), paginatedRecipes);
        assert.deepEqual(repository.listInput, { userId: 7, pagination });
    });
});
