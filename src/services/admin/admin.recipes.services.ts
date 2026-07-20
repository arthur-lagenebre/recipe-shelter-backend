import { ADMIN_AUDIT_EVENT_TYPES, ADMIN_AUDIT_TARGET_TYPES } from './admin-audit.events.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { canArchiveRecipe } from '../recipes/recipe-permissions.js';

import type { AdminAuditActionRunner } from './admin-audit-action.runner.js';
import type { AdminAuditRequestContext } from './admin-audit.service.js';
import type { AdminRecipeRepository } from "../../repositories/admin/admin.recipe.repository.interface.js";
import type { AdminRecipeAuditState, RecipeAdmin, RecipePending } from "../../repositories/admin/admin.recipe.types.js";
import type { RecipeImage } from '../../repositories/recipe-images/recipe-image.types.js';
import type { PoolConnection } from 'mysql2/promise';

const MODERATION_REASON_MIN_LENGTH = 10;
const MODERATION_REASON_MAX_LENGTH = 1000;

type RecipeImageCleanup = {
    findForCleanup(recipeId: number): Promise<RecipeImage | null>;
    cleanupAfterRecipeDeletion(image: RecipeImage): Promise<void>;
};

export class AdminRecipeService {
    constructor(private readonly adminRecipeRepository: AdminRecipeRepository, private readonly auditActions: AdminAuditActionRunner, private readonly recipeImageCleanup?: RecipeImageCleanup) { }

    async getPendingRecipesForAdmin(): Promise<RecipePending[]> {
        return this.adminRecipeRepository.findPendingForAdmin();
    }

    async getCountPendingRecipesForAdmin(): Promise<number> {
        return this.adminRecipeRepository.countPendingForAdmin();
    }

    async getRecipeForAdmin(recipeId: number): Promise<RecipeAdmin> {
        const recipe = await this.adminRecipeRepository.findByIdForAdmin(recipeId);

        if (!recipe)
            throw notFound('Recipe not found', 'RECIPES_NOT_FOUND');

        return recipe;
    }

    async approve(recipeId: number, adminUserId: number, context: AdminAuditRequestContext): Promise<boolean> {
        return this.auditActions.run(async ({ db, audit }) => {
            const recipe = await this.requireModeratableRecipe(recipeId, db);
            const published = await this.adminRecipeRepository.publish(recipeId, adminUserId, db);

            if (published)
                await audit.record({
                    actorUserId: adminUserId,
                    eventType: ADMIN_AUDIT_EVENT_TYPES.recipesApprove,
                    targetType: ADMIN_AUDIT_TARGET_TYPES.recipe,
                    targetId: recipeId,
                    beforeValues: snapshotRecipe(recipe),
                    afterValues: {
                        ...snapshotRecipe(recipe),
                        status: 'published',
                        moderatedByUserId: adminUserId,
                        rejectionReason: null
                    },
                    ...context
                });

            return published;
        });
    }

    async reject(recipeId: number, adminUserId: number, reason: string, context: AdminAuditRequestContext): Promise<boolean> {
        const cleanReason = validateModerationReason(reason, 'reject');

        return this.auditActions.run(async ({ db, audit }) => {
            const recipe = await this.requireModeratableRecipe(recipeId, db);
            const rejected = await this.adminRecipeRepository.reject(recipeId, adminUserId, cleanReason, db);

            if (rejected)
                await audit.record({
                    actorUserId: adminUserId,
                    eventType: ADMIN_AUDIT_EVENT_TYPES.recipesReject,
                    targetType: ADMIN_AUDIT_TARGET_TYPES.recipe,
                    targetId: recipeId,
                    reason: cleanReason,
                    beforeValues: snapshotRecipe(recipe),
                    afterValues: {
                        ...snapshotRecipe(recipe),
                        status: 'rejected',
                        moderatedByUserId: adminUserId,
                        rejectionReason: cleanReason
                    },
                    ...context
                });

            return rejected;
        });
    }

    async archive(recipeId: number, adminUserId: number, reason: string, context: AdminAuditRequestContext): Promise<boolean> {
        const cleanReason = validateModerationReason(reason, 'archive');

        return this.auditActions.run(async ({ db, audit }) => {
            const recipe = await this.requireRecipeAuditState(recipeId, db);

            if (!canArchiveRecipe(recipe))
                throw forbidden('Recipe cannot be archived', 'RECIPES_ARCHIVE_FORBIDDEN');

            const archived = await this.adminRecipeRepository.archive(recipeId, adminUserId, cleanReason, db);

            if (archived)
                await audit.record({
                    actorUserId: adminUserId,
                    eventType: ADMIN_AUDIT_EVENT_TYPES.recipesArchive,
                    targetType: ADMIN_AUDIT_TARGET_TYPES.recipe,
                    targetId: recipeId,
                    reason: cleanReason,
                    beforeValues: snapshotRecipe(recipe),
                    afterValues: {
                        ...snapshotRecipe(recipe),
                        status: 'archived',
                        archiveReason: cleanReason
                    },
                    ...context
                });

            return archived;
        });
    }

    async delete(recipeId: number, adminUserId: number, context: AdminAuditRequestContext): Promise<boolean> {
        const image = await this.recipeImageCleanup?.findForCleanup(recipeId) ?? null;
        const deleted = await this.auditActions.run(async ({ db, audit }) => {
            const recipe = await this.requireRecipeAuditState(recipeId, db);
            const result = await this.adminRecipeRepository.delete(recipeId, db);

            if (result)
                await audit.record({
                    actorUserId: adminUserId,
                    eventType: ADMIN_AUDIT_EVENT_TYPES.recipesDelete,
                    targetType: ADMIN_AUDIT_TARGET_TYPES.recipe,
                    targetId: recipeId,
                    beforeValues: snapshotRecipe(recipe),
                    afterValues: null,
                    ...context
                });

            return result;
        });

        if (deleted && image)
            await this.recipeImageCleanup?.cleanupAfterRecipeDeletion(image);

        return deleted;
    }

    private async requireModeratableRecipe(recipeId: number, db: PoolConnection): Promise<AdminRecipeAuditState> {
        const recipe = await this.requireRecipeAuditState(recipeId, db);

        if (recipe.status != 'pending')
            throw forbidden('Recipe cannot be moderated', 'RECIPES_MODERATE_FORBIDDEN');

        return recipe;
    }

    private async requireRecipeAuditState(
        recipeId: number,
        db: PoolConnection
    ): Promise<AdminRecipeAuditState> {
        const recipe = await this.adminRecipeRepository.findAuditStateById(recipeId, db);

        if (!recipe)
            throw notFound('Recipe not found', 'RECIPES_NOT_FOUND');

        return recipe;
    }

}

function snapshotRecipe(recipe: AdminRecipeAuditState) {
    return {
        userId: recipe.userId,
        categoryId: recipe.categoryId,
        title: recipe.title,
        slug: recipe.slug,
        status: recipe.status,
        moderatedByUserId: recipe.moderatedByUserId,
        rejectionReason: recipe.rejectionReason,
        archiveReason: recipe.archiveReason
    };
}

function validateModerationReason(reason: string, action: 'archive' | 'reject'): string {
    const cleanReason = typeof reason === 'string' ? reason.trim() : '';
    const label = action === 'reject' ? 'Rejection' : 'Archive';
    const codePrefix = `ADMIN_RECIPES_${action.toUpperCase()}`;

    if (!cleanReason)
        throw badRequest(`${label} reason is required`, `${codePrefix}_MISSING_REASON`);
    if (cleanReason.length < MODERATION_REASON_MIN_LENGTH)
        throw badRequest(`${label} reason must be at least ${MODERATION_REASON_MIN_LENGTH} characters`, `${codePrefix}_REASON_TOO_SHORT`);
    if (cleanReason.length > MODERATION_REASON_MAX_LENGTH)
        throw badRequest(`${label} reason must be at most ${MODERATION_REASON_MAX_LENGTH} characters`, `${codePrefix}_REASON_TOO_LONG`);

    return cleanReason;
}
