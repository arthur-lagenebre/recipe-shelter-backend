import type { RecipeInput, Recipe, UpdateRecipeInput, RecipeSummary, RecipeListItem, RecipeDetail, RecipeSearchFilters } from "./recipe.types.js";

export interface RecipeRepository {
    create(input: RecipeInput): Promise<Recipe>;
    updateDraft(input: UpdateRecipeInput): Promise<Recipe>;
    submit(id: number, slug: string): Promise<Recipe>;
    archive(id: number): Promise<boolean>;
    findById(id: number): Promise<Recipe | null>;
    findByUserId(userId: number): Promise<RecipeSummary[]>;
    findPublished(userId: number | null): Promise<RecipeListItem[]>;
    searchPublished(userId: number | null, filters: RecipeSearchFilters): Promise<RecipeListItem[]>;
    findPublishedBySlug(userId: number | null, slug: string): Promise<RecipeDetail | null>;
    existsBySlug(slug: string): Promise<boolean>;
}
