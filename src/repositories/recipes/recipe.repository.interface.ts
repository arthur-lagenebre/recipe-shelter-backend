import type { RecipeInput, Recipe, UpdateRecipeInput, RecipePending } from "./recipe.types.js";

export interface RecipeRepository {
    create(input: RecipeInput): Promise<Recipe>;
    updateDraft(input: UpdateRecipeInput): Promise<Recipe>;
    submit(id: number, slug: string): Promise<Recipe>;
    findById(id: number): Promise<Recipe | null>;
    findByIdForUser(id: number, userId: number): Promise<Recipe | null>;
    findByUserId(userId: number): Promise<Recipe[]>;
    existsBySlug(slug: string): Promise<boolean>;
    findPendingForAdmin(): Promise<RecipePending[]>;
    publish(id: number, moderatedByUserId: number): Promise<boolean>;
    reject(id: number, moderatedByUserId: number, rejectionReason: string): Promise<boolean>;
}
