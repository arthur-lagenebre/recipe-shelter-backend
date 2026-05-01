import type { RecipeAdmin, RecipePending } from "./admin.recipe.types.js";

export interface AdminRecipeRepository {
    findPendingForAdmin(): Promise<RecipePending[]>;
    findByIdForAdmin(id: number): Promise<RecipeAdmin | null>;
    publish(id: number, moderatedByUserId: number): Promise<boolean>;
    reject(id: number, moderatedByUserId: number, rejectionReason: string): Promise<boolean>;
}