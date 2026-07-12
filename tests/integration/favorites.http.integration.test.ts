import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';

import { createFavoritesController } from '../../src/api/favorites/favorites.controller.js';
import { createFavoritesRouter } from '../../src/api/favorites/favorites.routes.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { notFound } from '../../src/middlewares/not-found.js';
import { configureAuthUserRepository } from '../../src/middlewares/require-auth.js';
import { FavoriteService } from '../../src/services/favorites/favorites.service.js';
import { env } from '../../src/utils/env.js';
import { createPaginatedResult } from '../../src/utils/pagination.js';
import { startHttpTestServer } from '../helpers/http-test-server.js';

import type { FavoriteRepository } from '../../src/repositories/favorites/favorites.repository.interface.js';
import type { Favorite } from '../../src/repositories/favorites/favorites.types.js';
import type { RecipeListItem } from '../../src/repositories/recipes/recipe.types.js';
import type { User } from '../../src/repositories/users/user.types.js';
import type { PaginationOptions } from '../../src/utils/pagination.js';
import type { HttpTestServer } from '../helpers/http-test-server.js';

const activeUser: User = {
    id: 7,
    mail: 'alice@example.com',
    username: 'alice',
    roleId: 2,
    status: 'active',
    emailValidatedAt: new Date('2026-01-01T00:00:00.000Z'),
    bannedByUserId: null,
    bannedReason: null,
    bannedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z')
};

const publishedRecipe: RecipeListItem = {
    id: 12,
    title: 'Summer salad',
    slug: 'summer-salad',
    description: 'Fresh and quick',
    category: 'Salads',
    coverImageUrl: null,
    prepTimeMinutes: 10,
    restTimeMinutes: null,
    cookTimeMinutes: null,
    servings: 2,
    authorUsername: 'bob',
    publishedAt: new Date('2026-07-01T10:00:00.000Z'),
    isFavorite: true
};

class InMemoryFavoriteRepository implements FavoriteRepository {
    private readonly favorites = new Map<string, Favorite>();

    async create(userId: number, recipeId: number): Promise<Favorite> {
        const favorite = { userId, recipeId, createdAt: new Date('2026-07-13T08:00:00.000Z') };
        this.favorites.set(`${userId}:${recipeId}`, favorite);
        return favorite;
    }

    async delete(userId: number, recipeId: number): Promise<boolean> {
        return this.favorites.delete(`${userId}:${recipeId}`);
    }

    async getFavoriteRecipes(userId: number, pagination: PaginationOptions) {
        const items = this.favorites.has(`${userId}:${publishedRecipe.id}`) ? [publishedRecipe] : [];
        return createPaginatedResult(items, items.length, pagination);
    }
}

describe('favorites HTTP integration', () => {
    let server: HttpTestServer;
    let sessionCookie: string;

    before(async () => {
        const repository = new InMemoryFavoriteRepository();
        const service = new FavoriteService(repository);
        const app = express();

        configureAuthUserRepository({
            async findById(id) { return id === activeUser.id ? activeUser : null; }
        });

        app.use(cookieParser());
        app.use(express.json());
        app.use('/api/v1/favorites', createFavoritesRouter(createFavoritesController(service)));
        app.use(notFound);
        app.use(errorHandler);

        sessionCookie = `${env.auth.sessionCookieName}=${jwt.sign({
            sub: activeUser.id,
            username: activeUser.username,
            roleId: activeUser.roleId,
            status: activeUser.status
        }, env.auth.jwtSecret)}`;
        server = await startHttpTestServer(app);
    });

    after(async () => server.close());

    it('rejects unauthenticated access before reaching the controller', async () => {
        const response = await fetch(`${server.baseUrl}/api/v1/favorites/me`);

        assert.equal(response.status, 401);
        assert.deepEqual(await response.json(), {
            error: { message: 'Missing session cookie', code: 'AUTH_NO_TOKEN' }
        });
    });

    it('creates, lists and deletes a favorite through the full HTTP stack', async () => {
        const createResponse = await fetch(`${server.baseUrl}/api/v1/favorites/12`, {
            method: 'POST',
            headers: { cookie: sessionCookie }
        });
        assert.equal(createResponse.status, 200);
        assert.deepEqual(await createResponse.json(), {
            userId: 7,
            recipeId: 12,
            createdAt: '2026-07-13T08:00:00.000Z'
        });

        const listResponse = await fetch(`${server.baseUrl}/api/v1/favorites/me?page=1&limit=5`, {
            headers: { cookie: sessionCookie }
        });
        const listBody = await listResponse.json() as { items: RecipeListItem[]; pagination: { limit: number; totalItems: number } };

        assert.equal(listResponse.status, 200);
        assert.equal(listBody.items[0]?.id, 12);
        assert.deepEqual(listBody.pagination, {
            page: 1,
            limit: 5,
            totalItems: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false
        });

        const deleteResponse = await fetch(`${server.baseUrl}/api/v1/favorites/12`, {
            method: 'DELETE',
            headers: { cookie: sessionCookie }
        });
        assert.equal(deleteResponse.status, 200);
        assert.deepEqual(await deleteResponse.json(), { ok: true });
    });

    it('returns DTO validation errors in the public error contract', async () => {
        const response = await fetch(`${server.baseUrl}/api/v1/favorites/not-an-id`, {
            method: 'POST',
            headers: { cookie: sessionCookie }
        });

        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
            error: { message: 'Recipe id must be a positive integer', code: 'RECIPE_BAD_ID' }
        });
    });
});
