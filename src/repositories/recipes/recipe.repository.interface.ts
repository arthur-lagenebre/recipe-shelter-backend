import type {
    RecipeInput,
    Recipe,
    UpdateRecipeInput,
    RecipeSummary,
    RecipeListItem,
    RecipeDetail,
    RecipeSearchFilters
} from './recipe.types.js';
import type { PaginatedResult, PaginationOptions } from '../../utils/pagination.js';
import type { PoolConnection } from 'mysql2/promise';

export interface RecipeRepository {
    create(input: RecipeInput): Promise<Recipe>;
    updateDraft(input: UpdateRecipeInput): Promise<Recipe>;
    submit(id: number, slug: string): Promise<Recipe>;
    archive(id: number, db?: PoolConnection): Promise<boolean>;
    findById(id: number): Promise<Recipe | null>;
    findByUserId(userId: number, pagination: PaginationOptions): Promise<PaginatedResult<RecipeSummary>>;
    findPublished(userId: number | null, pagination: PaginationOptions): Promise<PaginatedResult<RecipeListItem>>;
    searchPublished(
        userId: number | null,
        filters: RecipeSearchFilters,
        pagination: PaginationOptions
    ): Promise<PaginatedResult<RecipeListItem>>;
    findPublishedByAuthorId(viewerUserId: number | null, authorUserId: number): Promise<RecipeListItem[]>;
    findRecentPublished(userId: number | null, limit: number): Promise<RecipeListItem[]>;
    findPublishedBySlug(userId: number | null, slug: string): Promise<RecipeDetail | null>;
    existsBySlug(slug: string): Promise<boolean>;
}
