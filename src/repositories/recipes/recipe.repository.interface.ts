import type { RecipeInput, Recipe, UpdateRecipeInput, RecipeSummary, RecipeListItem, RecipeDetail } from "./recipe.types.js";

export interface RecipeRepository {
    create(input: RecipeInput): Promise<Recipe>;
    updateDraft(input: UpdateRecipeInput): Promise<Recipe>;
    submit(id: number, slug: string): Promise<Recipe>;
    findById(id: number): Promise<Recipe | null>;
    findByUserId(userId: number): Promise<RecipeSummary[]>;
    findPublished(userId: number | null): Promise<RecipeListItem[]>;
    findPublishedBySlug(userId: number | null, slug: string): Promise<RecipeDetail | null>;
    existsBySlug(slug: string): Promise<boolean>;
}
