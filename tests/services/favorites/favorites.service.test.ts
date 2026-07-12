import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { FavoriteService } from '../../../src/services/favorites/favorites.service.js';
import { HttpError } from '../../../src/utils/errors.js';

import type { FavoriteRepository } from '../../../src/repositories/favorites/favorites.repository.interface.js';
import type { Favorite } from '../../../src/repositories/favorites/favorites.types.js';
import type { RecipeListItem } from '../../../src/repositories/recipes/recipe.types.js';
import type { PaginatedResult, PaginationOptions } from '../../../src/utils/pagination.js';

const favorite: Favorite = {
    userId: 7,
    recipeId: 12,
    createdAt: new Date('2026-07-12T10:00:00.000Z')
};

const recipe: RecipeListItem = {
    id: 12,
    title: 'Summer salad',
    slug: 'summer-salad',
    description: 'Fresh and quick',
    category: 'Salads',
    coverImageUrl: null,
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

function assertHttpError(error: unknown, code: string): boolean {
    assert.ok(error instanceof HttpError);
    assert.equal(error.statusCode, 500);
    assert.equal(error.code, code);

    return true;
}

describe('FavoriteService', () => {
    let repository: FakeFavoriteRepository;
    let service: FavoriteService;

    beforeEach(() => {
        repository = new FakeFavoriteRepository();
        service = new FavoriteService(repository);
    });

    it('creates a favorite for the authenticated user', async () => {
        assert.deepEqual(await service.createFavorite(7, 12), favorite);
        assert.deepEqual(repository.createInput, { userId: 7, recipeId: 12 });
    });

    it('reports a repository creation failure', async () => {
        repository.createResult = null;

        await assert.rejects(
            () => service.createFavorite(7, 12),
            (error) => assertHttpError(error, 'FAVORITE_CANNOT_BE_CREATED')
        );
    });

    it('deletes a favorite for the authenticated user', async () => {
        assert.equal(await service.deleteFavorite(7, 12), true);
        assert.deepEqual(repository.deleteInput, { userId: 7, recipeId: 12 });
    });

    it('reports a repository deletion failure', async () => {
        repository.deleteResult = false;

        await assert.rejects(
            () => service.deleteFavorite(7, 12),
            (error) => assertHttpError(error, 'FAVORITE_CANNOT_BE_DELETED')
        );
    });

    it('returns the paginated favorite recipes without altering pagination', async () => {
        const pagination = { page: 2, limit: 12, offset: 12 };

        assert.deepEqual(await service.getFavoriteRecipes(7, pagination), paginatedRecipes);
        assert.deepEqual(repository.listInput, { userId: 7, pagination });
    });
});
