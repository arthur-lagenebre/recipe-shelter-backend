import type { Favorite, FavoriteRow } from './favorite.types.js';

export function mapFavorite(row: FavoriteRow): Favorite {
    return {
        userId: row.UserId,
        recipeId: row.RecipeId,
        createdAt: row.CreatedAt
    };
}