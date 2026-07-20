import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { AdminRecipeService } from '../../../src/services/admin/admin.recipes.services.js';
import { HttpError } from '../../../src/utils/errors.js';
import { TestAdminAuditRecorder, testAdminAuditContext } from '../../helpers/admin-audit.js';

import type { AdminRecipeRepository } from '../../../src/repositories/admin/admin.recipe.repository.interface.js';
import type { AdminRecipeAuditState, RecipeAdmin, RecipePending } from '../../../src/repositories/admin/admin.recipe.types.js';
import type { RecipeImage } from '../../../src/repositories/recipe-images/recipe-image.types.js';
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
    archiveReason: null,
    updatedAt: new Date('2026-05-10T10:00:00.000Z'),
    tags: [],
    ingredients: [],
    steps: [],
    equipments: []
};

class FakeRecipeRepository {
    recipe: Recipe | null = baseRecipe;
    async findById(): Promise<Recipe | null> {
        return this.recipe;
    }
}

class FakeAdminRecipeRepository implements AdminRecipeRepository {
    publishedInput: { id: number; adminUserId: number } | null = null;
    rejectedInput: { id: number; adminUserId: number; reason: string } | null = null;
    archivedInput: { id: number; adminUserId: number; reason: string } | null = null;
    deletedId: number | null = null;
    recipeAdmin: RecipeAdmin | null = adminRecipe;

    constructor(private readonly recipes: FakeRecipeRepository) { }

    async findPendingForAdmin(): Promise<RecipePending[]> {
        return [pendingRecipe];
    }

    async countPendingForAdmin(): Promise<number> {
        return 1;
    }

    async findByIdForAdmin(): Promise<RecipeAdmin | null> {
        return this.recipeAdmin;
    }

    async findAuditStateById(): Promise<AdminRecipeAuditState | null> {
        const recipe = this.recipes.recipe;

        return recipe ? {
            id: recipe.id,
            userId: recipe.userId,
            categoryId: recipe.categoryId,
            title: recipe.title,
            slug: recipe.slug,
            status: recipe.status,
            moderatedByUserId: recipe.moderatedByUserId,
            rejectionReason: recipe.rejectionReason,
            archiveReason: null
        } : null;
    }

    async publish(id: number, adminUserId: number): Promise<boolean> {
        this.publishedInput = { id, adminUserId };
        return true;
    }

    async reject(id: number, adminUserId: number, reason: string): Promise<boolean> {
        this.rejectedInput = { id, adminUserId, reason };
        return true;
    }

    async archive(id: number, adminUserId: number, reason: string): Promise<boolean> {
        this.archivedInput = { id, adminUserId, reason };
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
    let audit: TestAdminAuditRecorder;
    let service: AdminRecipeService;

    beforeEach(() => {
        recipes = new FakeRecipeRepository();
        adminRecipes = new FakeAdminRecipeRepository(recipes);
        audit = new TestAdminAuditRecorder();
        service = new AdminRecipeService(adminRecipes, audit);
    });

    it('lists, counts and gets recipes for admin', async () => {
        assert.deepEqual(await service.getPendingRecipesForAdmin(), [pendingRecipe]);
        assert.equal(await service.getCountPendingRecipesForAdmin(), 1);
        assert.deepEqual(await service.getRecipeForAdmin(10), adminRecipe);

        adminRecipes.recipeAdmin = null;
        await assert.rejects(() => service.getRecipeForAdmin(99), (error) => assertHttpError(error, 'RECIPES_NOT_FOUND', 404));
    });

    it('approves and rejects pending recipes', async () => {
        assert.equal(await service.approve(10, 1, testAdminAuditContext), true);
        assert.deepEqual(adminRecipes.publishedInput, { id: 10, adminUserId: 1 });
        assert.equal(audit.inputs.length, 1);
        assert.equal(audit.inputs[0]?.eventType, 'recipes.approve');

        assert.equal(await service.reject(10, 1, 'Missing details', testAdminAuditContext), true);
        assert.deepEqual(adminRecipes.rejectedInput, { id: 10, adminUserId: 1, reason: 'Missing details' });
        assert.equal(audit.inputs.length, 2);
        assert.deepEqual(audit.inputs[1], {
            actorUserId: 1,
            eventType: 'recipes.reject',
            targetType: 'recipe',
            targetId: 10,
            reason: 'Missing details',
            beforeValues: snapshotBaseRecipe(),
            afterValues: {
                ...snapshotBaseRecipe(),
                status: 'rejected',
                moderatedByUserId: 1,
                rejectionReason: 'Missing details'
            },
            ...testAdminAuditContext
        });
    });

    it('rejects moderation when recipe is missing or not pending', async () => {
        recipes.recipe = null;
        await assert.rejects(() => service.approve(10, 1, testAdminAuditContext), (error) => assertHttpError(error, 'RECIPES_NOT_FOUND', 404));

        recipes.recipe = { ...baseRecipe, status: 'draft' };
        await assert.rejects(() => service.reject(10, 1, 'Valid reason', testAdminAuditContext), (error) => assertHttpError(error, 'RECIPES_MODERATE_FORBIDDEN', 403));
        assert.equal(audit.inputs.length, 0);
    });

    it('rejects missing, short and oversized moderation reasons before persistence', async () => {
        for (const [action, reason, code] of [
            ['reject', '   ', 'ADMIN_RECIPES_REJECT_MISSING_REASON'],
            ['reject', 'short', 'ADMIN_RECIPES_REJECT_REASON_TOO_SHORT'],
            ['archive', 'x'.repeat(1001), 'ADMIN_RECIPES_ARCHIVE_REASON_TOO_LONG']
        ] as const) {
            await assert.rejects(
                () => action === 'reject'
                    ? service.reject(10, 1, reason, testAdminAuditContext)
                    : service.archive(10, 1, reason, testAdminAuditContext),
                (error) => assertHttpError(error, code, 400)
            );
        }

        assert.equal(adminRecipes.rejectedInput, null);
        assert.equal(adminRecipes.archivedInput, null);
        assert.equal(audit.inputs.length, 0);
    });

    it('archives only published or rejected recipes and deletes existing recipes', async () => {
        recipes.recipe = { ...baseRecipe, status: 'published' };
        assert.equal(await service.archive(10, 1, 'Repeated policy violations.', testAdminAuditContext), true);
        assert.deepEqual(adminRecipes.archivedInput, { id: 10, adminUserId: 1, reason: 'Repeated policy violations.' });
        assert.equal(audit.inputs.length, 1);
        assert.deepEqual(audit.inputs[0], {
            actorUserId: 1,
            eventType: 'recipes.archive',
            targetType: 'recipe',
            targetId: 10,
            reason: 'Repeated policy violations.',
            beforeValues: { ...snapshotBaseRecipe(), status: 'published' },
            afterValues: {
                ...snapshotBaseRecipe(),
                status: 'archived',
                archiveReason: 'Repeated policy violations.'
            },
            ...testAdminAuditContext
        });

        recipes.recipe = { ...baseRecipe, status: 'draft' };
        await assert.rejects(() => service.archive(10, 1, 'Repeated policy violations.', testAdminAuditContext), (error) => assertHttpError(error, 'RECIPES_ARCHIVE_FORBIDDEN', 403));

        recipes.recipe = baseRecipe;
        assert.equal(await service.delete(10, 1, testAdminAuditContext), true);
        assert.equal(adminRecipes.deletedId, 10);
        assert.equal(audit.inputs.length, 2);
        assert.equal(audit.inputs[1]?.eventType, 'recipes.delete');

        recipes.recipe = null;
        await assert.rejects(() => service.delete(99, 1, testAdminAuditContext), (error) => assertHttpError(error, 'RECIPES_NOT_FOUND', 404));
        assert.equal(audit.inputs.length, 2);
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
        const recordAudit = audit.record.bind(audit);
        audit.record = async (input) => {
            events.push('audit:record');
            return recordAudit(input);
        };
        service = new AdminRecipeService(adminRecipes, audit, cleanup);

        assert.equal(await service.delete(10, 1, testAdminAuditContext), true);
        assert.deepEqual(events, ['image:read', 'db:delete', 'audit:record', 'storage:delete']);
    });

    it('propagates audit failures and does not continue recipe deletion cleanup', async () => {
        audit.error = new Error('audit unavailable');
        const cleanup = {
            async findForCleanup() {
                return null;
            },
            async cleanupAfterRecipeDeletion() {
                assert.fail('cleanup must not run');
            }
        };
        service = new AdminRecipeService(adminRecipes, audit, cleanup);

        await assert.rejects(
            () => service.delete(10, 1, testAdminAuditContext),
            /audit unavailable/
        );
        assert.equal(adminRecipes.deletedId, 10);
    });
});

function snapshotBaseRecipe() {
    return {
        userId: baseRecipe.userId,
        categoryId: baseRecipe.categoryId,
        title: baseRecipe.title,
        slug: baseRecipe.slug,
        status: baseRecipe.status,
        moderatedByUserId: baseRecipe.moderatedByUserId,
        rejectionReason: baseRecipe.rejectionReason,
        archiveReason: null
    };
}
