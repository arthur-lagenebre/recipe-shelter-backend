import type { Favorite, FavoriteRow } from './favorites.types.js';

export function mapFavorite(row: FavoriteRow): Favorite {
    return {
        userId: row.UserId,
        recipeId: row.RecipeId,
        createdAt: row.CreatedAt
    };
}