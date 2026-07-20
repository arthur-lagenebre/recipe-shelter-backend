import type { Favorite } from "./favorite.types.js";
import type { PaginatedResult, PaginationOptions } from "../../utils/pagination.js";
import type { RecipeListItem } from "../recipes/recipe.types.js";

export interface FavoriteRepository {
    create(userId: number, recipeId: number): Promise<Favorite>;
    delete(userId: number, recipeId: number): Promise<boolean>;
    getFavoriteRecipes(userId: number, pagination: PaginationOptions): Promise<PaginatedResult<RecipeListItem>>;
}
