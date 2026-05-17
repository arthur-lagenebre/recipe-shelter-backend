import type { RecipeInput, Recipe, UpdateRecipeInput, RecipeSummary, RecipeListItem, RecipeDetail, RecipeSearchFilters, RatedRecipeListItem } from "./recipe.types.js";
import type { PaginatedResult, PaginationOptions } from "../../utils/pagination.js";

export interface RecipeRepository {
    create(input: RecipeInput): Promise<Recipe>;
    updateDraft(input: UpdateRecipeInput): Promise<Recipe>;
    submit(id: number, slug: string): Promise<Recipe>;
    archive(id: number): Promise<boolean>;
    findById(id: number): Promise<Recipe | null>;
    findByUserId(userId: number, pagination: PaginationOptions): Promise<PaginatedResult<RecipeSummary>>;
    findPublished(userId: number | null, pagination: PaginationOptions): Promise<PaginatedResult<RecipeListItem>>;
    searchPublished(userId: number | null, filters: RecipeSearchFilters, pagination: PaginationOptions): Promise<PaginatedResult<RecipeListItem>>;
    findRecentPublished(userId: number | null, limit: number): Promise<RecipeListItem[]>;
    findTopRatedPublished(userId: number | null, limit: number): Promise<RatedRecipeListItem[]>;
    findPublishedBySlug(userId: number | null, slug: string): Promise<RecipeDetail | null>;
    existsBySlug(slug: string): Promise<boolean>;
}
