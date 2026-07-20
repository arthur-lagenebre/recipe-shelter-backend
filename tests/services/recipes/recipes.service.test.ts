import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { RecipeService } from '../../../src/services/recipes/recipes.services.js';
import { PERMISSIONS } from '../../../src/security/permissions.js';
import { HttpError } from '../../../src/utils/errors.js';

import type { AuthContext } from '../../../src/api/auth/auth.types.js';
import type { RecipeRepository } from '../../../src/repositories/recipes/recipe.repository.interface.js';
import type { Recipe, RecipeDetail, RecipeInput, RecipeListItem, RecipeSearchFilters, RecipeSummary, UpdateRecipeInput } from '../../../src/repositories/recipes/recipe.types.js';
import type { PaginatedResult, PaginationOptions } from '../../../src/utils/pagination.js';

const baseRecipe: Recipe = {
    id: 10,
    userId: 2,
    categoryId: 1,
    title: 'Cake',
    slug: 'cake-draft',
    description: 'Good',
    coverImage: null,
    prepTimeMinutes: 15,
    restTimeMinutes: null,
    cookTimeMinutes: 45,
    servings: 6,
    status: 'draft',
    createdAt: new Date('2026-05-09T10:00:00.000Z'),
    submittedAt: null,
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

const auth: AuthContext = { userId: 2, username: 'owner', accountType: 'community', status: 'active', permissions: [] };
const adminAuth: AuthContext = { userId: 1, username: 'admin', accountType: 'staff', status: 'active', permissions: [PERMISSIONS.recipeReview] };
const pagination: PaginationOptions = { page: 1, limit: 12, offset: 0 };

class FakeRecipeRepository implements RecipeRepository {
    recipe: Recipe | null = baseRecipe;
    createdInput: RecipeInput | null = null;
    updatedInput: UpdateRecipeInput | null = null;
    submittedInput: { id: number; slug: string } | null = null;
    archivedId: number | null = null;
    publishedFilters: { userId: number | null; filters: RecipeSearchFilters; pagination: PaginationOptions } | null = null;

    async create(input: RecipeInput): Promise<Recipe> {
        this.createdInput = input;
        return { ...baseRecipe, id: 99, userId: input.userId, title: input.title, slug: input.slug };
    }

    async updateDraft(input: UpdateRecipeInput): Promise<Recipe> {
        this.updatedInput = input;
        return { ...baseRecipe, id: input.id, userId: input.userId, title: input.title, slug: input.slug };
    }

    async submit(id: number, slug: string): Promise<Recipe> {
        this.submittedInput = { id, slug };
        return { ...baseRecipe, id, slug, status: 'pending' };
    }

    async archive(id: number): Promise<boolean> {
        this.archivedId = id;
        return true;
    }

    async findById(): Promise<Recipe | null> {
        return this.recipe;
    }

    async findByUserId(): Promise<PaginatedResult<RecipeSummary>> {
        return { items: [], pagination: { page: 1, limit: 12, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } };
    }

    async findPublished(): Promise<PaginatedResult<RecipeListItem>> {
        return { items: [], pagination: { page: 1, limit: 12, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } };
    }

    async searchPublished(userId: number | null, filters: RecipeSearchFilters, page: PaginationOptions): Promise<PaginatedResult<RecipeListItem>> {
        this.publishedFilters = { userId, filters, pagination: page };
        return { items: [], pagination: { page: 1, limit: 12, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } };
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

class FakeSlugService {
    async createDraftSlug(userId: number): Promise<string> {
        return `draft-${userId}`;
    }

    async createPublicSlug(title: string): Promise<string> {
        return `public-${title.toLowerCase()}`;
    }
}

function assertHttpError(error: unknown, code: string, status: number): boolean {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
    return true;
}

describe('RecipeService', () => {
    let repository: FakeRecipeRepository;
    let service: RecipeService;

    beforeEach(() => {
        repository = new FakeRecipeRepository();
        service = new RecipeService(repository, new FakeSlugService() as never);
    });

    it('normalizes recipe creation inputs', async () => {
        await service.create(2, {
            categoryId: undefined,
            title: '  Cake maison  ',
            description: '  Good  ',
            tagIds: [1, 1, 2],
            ingredients: [
                { ingredientId: 7, quantity: 2, unit: '  ', note: '  note  ' },
                { ingredientId: 8 }
            ],
            steps: [{ description: '  Bake  ' }],
            equipments: [{ equipmentId: 4 }]
        });

        assert.deepEqual(repository.createdInput, {
            userId: 2,
            categoryId: null,
            title: 'Cake maison',
            slug: 'draft-2',
            description: 'Good',
            prepTimeMinutes: 0,
            restTimeMinutes: null,
            cookTimeMinutes: null,
            servings: 1,
            tagIds: [1, 2],
            ingredients: [
                { ingredientId: 7, quantity: 2, unit: null, note: 'note', sortOrder: 1 },
                { ingredientId: 8, quantity: null, unit: null, note: null, sortOrder: 2 }
            ],
            steps: [{ stepNumber: 1, description: 'Bake' }],
            equipments: [{ equipmentId: 4 }]
        });
    });

    it('allows owners to update drafts with normalized partial collections', async () => {
        await service.updateDraft(10, auth, {
            title: '  New cake  ',
            ingredients: [{ ingredientId: 8, quantity: 1, unit: 'g', note: '  fine  ', sortOrder: 4 }],
            tagIds: [3, 3]
        });

        assert.deepEqual(repository.updatedInput, {
            id: 10,
            userId: 2,
            slug: 'cake-draft',
            categoryId: undefined,
            title: 'New cake',
            description: undefined,
            prepTimeMinutes: undefined,
            restTimeMinutes: undefined,
            cookTimeMinutes: undefined,
            servings: undefined,
            tagIds: [3],
            ingredients: [{ ingredientId: 8, quantity: 1, unit: 'g', note: 'fine', sortOrder: 4 }],
            steps: undefined,
            equipments: undefined
        });
    });

    it('enforces view and edit permissions', async () => {
        repository.recipe = null;
        await assert.rejects(() => service.get(10, auth), (error) => assertHttpError(error, 'RECIPES_NOT_FOUND', 404));

        repository.recipe = { ...baseRecipe, userId: 99, status: 'draft' };
        await assert.rejects(() => service.get(10, auth), (error) => assertHttpError(error, 'RECIPES_ACCESS_DENIED', 403));

        assert.deepEqual(await service.get(10, adminAuth), repository.recipe);

        repository.recipe = { ...baseRecipe, userId: 2, status: 'published' };
        await assert.rejects(() => service.updateDraft(10, auth, { title: 'New title' }), (error) => assertHttpError(error, 'RECIPES_EDIT_FORBIDDEN', 403));
    });

    it('submits drafts with a public slug', async () => {
        await service.submit(10, auth);

        assert.deepEqual(repository.submittedInput, { id: 10, slug: 'public-cake' });
    });

    it('archives only owned published or rejected recipes', async () => {
        repository.recipe = { ...baseRecipe, status: 'published' };
        assert.equal(await service.archive(10, auth), true);
        assert.equal(repository.archivedId, 10);

        repository.recipe = { ...baseRecipe, userId: 99, status: 'published' };
        await assert.rejects(() => service.archive(10, auth), (error) => assertHttpError(error, 'RECIPES_ACCESS_DENIED', 403));

        repository.recipe = { ...baseRecipe, status: 'draft' };
        await assert.rejects(() => service.archive(10, auth), (error) => assertHttpError(error, 'RECIPES_ARCHIVE_FORBIDDEN', 403));
    });

    it('delegates published searches', async () => {
        await service.searchPublished(2, { q: 'cake', excludedTagIds: [8], excludedIngredientIds: [10, 11] }, pagination);

        assert.deepEqual(repository.publishedFilters, {
            userId: 2,
            filters: { q: 'cake', excludedTagIds: [8], excludedIngredientIds: [10, 11] },
            pagination
        });
    });
});
