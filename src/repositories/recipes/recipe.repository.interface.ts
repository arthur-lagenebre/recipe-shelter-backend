import type { RecipeInput, Recipe, UpdateRecipeInput, RecipeSummary } from "./recipe.types.js";

export interface RecipeRepository {
    create(input: RecipeInput): Promise<Recipe>;
    updateDraft(input: UpdateRecipeInput): Promise<Recipe>;
    submit(id: number, slug: string): Promise<Recipe>;
    findById(id: number): Promise<Recipe | null>;
    findByUserId(userId: number): Promise<RecipeSummary[]>;
    existsBySlug(slug: string): Promise<boolean>;
}
