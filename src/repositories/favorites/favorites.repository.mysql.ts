import { mapFavorite } from './favorites.mapper.js';
import { firstOrNull } from '../../utils/array.js';
import { mapRecipeListItem } from '../recipes/recipe.mapper.js';

import type { FavoriteRepository } from "./favorites.repository.interface.js";
import type { Favorite, FavoriteRow } from './favorites.types.js';
import type { RecipeListItem, RecipeListItemRow } from '../recipes/recipe.types.js';
import type { ResultSetHeader } from 'mysql2';
import type { Pool } from 'mysql2/promise';

export class FavoriteRepositoryMysql implements FavoriteRepository {
    constructor(private readonly db: Pool) { }

    async create(userId: number, recipeId: number): Promise<Favorite> {
        await this.db.execute(
            `INSERT INTO Favorites (UserId, RecipeId)
             VALUES (?, ?)`,
            [userId, recipeId]
        );

        const created = await this.findById(userId, recipeId);

        if (!created)
            throw new Error('User created but cannot be reloaded');

        return created;
    }

    async findById(userId: number, recipeId: number): Promise<Favorite | null> {
        const [rows] = await this.db.execute(
            `SELECT UserId, RecipeId, CreatedAt
             FROM Favorites
             WHERE UserId = ? AND RecipeId = ?`,
            [userId, recipeId]
        );

        const row = firstOrNull(rows as FavoriteRow[]);
        return row ? mapFavorite(row) : null;
    }

    async delete(userId: number, recipeId: number): Promise<boolean> {
        const [result] = await this.db.execute<ResultSetHeader>(
            `DELETE FROM Favorites
             WHERE UserId = ? AND RecipeId = ?`,
            [userId, recipeId]
        );

        return result.affectedRows > 0;
    }

    async getFavoriteRecipes(userId: number): Promise<RecipeListItem[]> {
        const [rows] = await this.db.execute(
            `SELECT *
             FROM Favorites AS f
             JOIN Recipes AS r ON r.Id = f.RecipeId
            WHERE r.Status = 'published' AND f.UserId = ?`,
            [userId]
        );

        return (rows as RecipeListItemRow[]).map(mapRecipeListItem);
    }
}
