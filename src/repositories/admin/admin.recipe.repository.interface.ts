import type { AdminRecipeAuditState, RecipeAdmin, RecipePending } from './admin.recipe.types.js';
import type { PoolConnection } from 'mysql2/promise';

export interface AdminRecipeRepository {
    findPendingForAdmin(): Promise<RecipePending[]>;
    countPendingForAdmin(): Promise<number>;
    findByIdForAdmin(id: number): Promise<RecipeAdmin | null>;
    findAuditStateById(id: number, db: PoolConnection): Promise<AdminRecipeAuditState | null>;
    publish(id: number, moderatedByUserId: number, db?: PoolConnection): Promise<boolean>;
    reject(id: number, moderatedByUserId: number, rejectionReason: string, db?: PoolConnection): Promise<boolean>;
    archive(id: number, moderatedByUserId: number, archiveReason: string, db?: PoolConnection): Promise<boolean>;
    createModerationLog(auditLogId: number, recipeId: number, db: PoolConnection): Promise<void>;
    delete(id: number, db?: PoolConnection): Promise<boolean>;
}
