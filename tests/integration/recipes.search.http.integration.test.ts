import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';

import { createRecipesController } from '../../src/api/recipes/recipes.controller.js';
import { createRecipesRouter } from '../../src/api/recipes/recipes.routes.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { notFound } from '../../src/middlewares/not-found.js';
import { createPaginatedResult } from '../../src/utils/pagination.js';
import { startHttpTestServer } from '../helpers/http-test-server.js';

import type { RecipeSearchFilters } from '../../src/repositories/recipes/recipe.types.js';
import type { RecipeService } from '../../src/services/recipes/recipes.services.js';
import type { PaginationOptions } from '../../src/utils/pagination.js';
import type { HttpTestServer } from '../helpers/http-test-server.js';

describe('recipes search HTTP integration', () => {
    let server: HttpTestServer;
    let receivedSearch: { filters: RecipeSearchFilters; pagination: PaginationOptions } | null;

    before(async () => {
        const recipeService = {
            async searchPublished(_userId: number | null, filters: RecipeSearchFilters, pagination: PaginationOptions) {
                receivedSearch = { filters, pagination };

                return createPaginatedResult([{
                    id: 42,
                    title: 'Filter fixture',
                    slug: 'filter-fixture',
                    description: 'Fixture',
                    category: 'Main',
                    coverImage: null,
                    prepTimeMinutes: 10,
                    restTimeMinutes: null,
                    cookTimeMinutes: 20,
                    servings: 4,
                    authorUsername: 'author',
                    publishedAt: new Date('2026-07-13T10:00:00.000Z'),
                    isFavorite: false
                }], 13, pagination);
            }
        } as unknown as RecipeService;
        const app = express();

        app.use(cookieParser());
        const recipeImageService = { replace: async () => { throw new Error('Not used'); }, delete: async () => { throw new Error('Not used'); } };
        app.use('/api/v1/recipes', createRecipesRouter(createRecipesController(recipeService, recipeImageService as never)));
        app.use(notFound);
        app.use(errorHandler);

        server = await startHttpTestServer(app);
    });

    after(async () => server.close());

    it('deduplicates all id lists and preserves the paginated response contract', async () => {
        const response = await fetch(`${server.baseUrl}/api/v1/recipes/search?q=fixture&categoryId=3&tagIds=1,1,2&excludedTagIds=8,8&ingredientIds=4,5,4&excludedIngredientIds=10,11,10&maxTotalTimeMinutes=60&page=2&limit=12`);
        const body = await response.json() as { items: Array<{ id: number }>; pagination: { totalItems: number } };

        assert.equal(response.status, 200);
        assert.deepEqual(receivedSearch, {
            filters: {
                q: 'fixture',
                categoryId: 3,
                tagIds: [1, 2],
                excludedTagIds: [8],
                ingredientIds: [4, 5],
                excludedIngredientIds: [10, 11],
                maxTotalTimeMinutes: 60
            },
            pagination: { page: 2, limit: 12, offset: 12 }
        });
        assert.equal(body.items[0]?.id, 42);
        assert.deepEqual(body.pagination, {
            page: 2,
            limit: 12,
            totalItems: 13,
            totalPages: 2,
            hasNextPage: false,
            hasPreviousPage: true
        });
    });

    it('returns tag conflicts in the project error format', async () => {
        const response = await fetch(`${server.baseUrl}/api/v1/recipes/search?tagIds=1,2&excludedTagIds=2,8`);

        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
            error: {
                message: 'A tag id cannot be both included and excluded',
                code: 'RECIPES_SEARCH_TAG_FILTER_CONFLICT'
            }
        });
    });

    it('returns malformed exclusion lists in the project error format', async () => {
        const response = await fetch(`${server.baseUrl}/api/v1/recipes/search?excludedIngredientIds=10,,11`);

        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
            error: {
                message: 'Excluded ingredient ids must be a comma-separated list of positive integers',
                code: 'RECIPES_SEARCH_BAD_EXCLUDED_INGREDIENTS'
            }
        });
    });
});
