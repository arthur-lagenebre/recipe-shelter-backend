import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RecipeRepositoryMysql } from '../../../src/repositories/recipes/recipe.repository.mysql.js';

import type { Pool } from 'mysql2/promise';

type ExecuteCall = {
    sql: string;
    params: unknown;
};

describe('RecipeRepositoryMysql.searchPublished', () => {
    it('combines inclusive filters and NOT EXISTS exclusions in count and page queries', async () => {
        const calls: ExecuteCall[] = [];
        const db = {
            async execute(sql: string, params: unknown) {
                calls.push({ sql, params });

                if (sql.includes('COUNT(*)')) return [[{ Count: 3 }], []];

                return [
                    [
                        {
                            Id: 42,
                            Title: 'Filter fixture',
                            Slug: 'filter-fixture',
                            Description: 'Fixture',
                            CoverImageId: null,
                            CoverImageLargeStorageKey: null,
                            CoverImageMediumStorageKey: null,
                            CoverImageThumbnailStorageKey: null,
                            CoverImageWidth: null,
                            CoverImageHeight: null,
                            CoverImageAltText: null,
                            Category: 'Main',
                            PrepTimeMinutes: 10,
                            RestTimeMinutes: null,
                            CookTimeMinutes: 20,
                            Servings: 4,
                            AuthorUsername: 'author',
                            PublishedAt: new Date('2026-07-13T10:00:00.000Z'),
                            IsFavorite: 0
                        }
                    ],
                    []
                ];
            }
        } as unknown as Pool;
        const repository = new RecipeRepositoryMysql(db);

        const result = await repository.searchPublished(
            7,
            {
                q: 'fixture',
                categoryId: 3,
                tagIds: [1, 2],
                excludedTagIds: [8],
                ingredientIds: [4, 5],
                excludedIngredientIds: [10, 11],
                maxTotalTimeMinutes: 60
            },
            { page: 2, limit: 12, offset: 12 }
        );

        assert.equal(calls.length, 2);
        const [countCall, pageCall] = calls;
        assert.ok(countCall);
        assert.ok(pageCall);

        for (const call of calls) {
            assert.equal((call.sql.match(/NOT EXISTS/g) ?? []).length, 2);
            assert.match(call.sql, /FROM RecipeTags AS excluded_rt/);
            assert.match(call.sql, /excluded_rt\.RecipeId = r\.Id/);
            assert.match(call.sql, /FROM RecipeIngredients AS excluded_ri/);
            assert.match(call.sql, /excluded_ri\.RecipeId = r\.Id/);
            assert.match(call.sql, /HAVING COUNT\(DISTINCT rt\.TagId\) = \?/);
            assert.match(call.sql, /HAVING COUNT\(DISTINCT ri\.IngredientId\) = \?/);
            assert.match(call.sql, /r\.Status = 'published'/);
        }

        const filterParams = ['%fixture%', 3, 1, 2, 2, 8, 4, 5, 2, 10, 11, 60];
        assert.deepEqual(countCall.params, filterParams);
        assert.deepEqual(pageCall.params, [7, 7, ...filterParams]);
        assert.equal(result.items.length, 1);
        assert.equal(result.items[0]?.id, 42);
        assert.deepEqual(result.pagination, {
            page: 2,
            limit: 12,
            totalItems: 3,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: true
        });
    });
});
