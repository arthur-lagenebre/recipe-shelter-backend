import { mapFavorite } from './favorites.mapper.js';
import { firstOrNull } from '../../utils/array.js';
import { createPaginatedResult, formatLimitOffsetClause } from '../../utils/pagination.js';
import { mapRecipeListItem } from '../recipes/recipe.mapper.js';

import type { FavoriteRepository } from "./favorites.repository.interface.js";
import type { Favorite, FavoriteRow } from './favorites.types.js';
import type { PaginatedResult, PaginationOptions } from '../../utils/pagination.js';
import type { RecipeListItem, RecipeListItemRow } from '../recipes/recipe.types.js';
import type { ResultSetHeader } from 'mysql2';
import type { Pool } from 'mysql2/promise';

type CountRow = {
    Count: number | string;
};

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

    async getFavoriteRecipes(userId: number, pagination: PaginationOptions): Promise<PaginatedResult<RecipeListItem>> {
        const limitOffsetClause = formatLimitOffsetClause(pagination);

        const [countRows] = await this.db.execute(
            `SELECT COUNT(*) AS Count
             FROM Favorites AS f
             INNER JOIN Recipes AS r ON r.Id = f.RecipeId
             WHERE r.Status = 'published' AND f.UserId = ?`,
            [userId]
        );

        const [rows] = await this.db.execute(
            `SELECT r.Id, r.Title, r.Slug, r.Description, r.RecipeCoverImage, rc.Name AS Category, r.PrepTimeMinutes, r.RestTimeMinutes, r.CookTimeMinutes, r.Servings, u.Username AS AuthorUsername, r.PublishedAt, TRUE AS IsFavorite
             FROM Favorites AS f
             INNER JOIN Recipes AS r ON r.Id = f.RecipeId
             LEFT JOIN RecipeCategories AS rc ON rc.Id = r.CategoryId
             INNER JOIN Users AS u ON u.Id = r.UserId
             WHERE r.Status = 'published' AND f.UserId = ?
             ORDER BY f.CreatedAt DESC, r.Id DESC
             ${limitOffsetClause}`,
            [userId]
        );

        return createPaginatedResult((rows as RecipeListItemRow[]).map(mapRecipeListItem), this.mapCount(countRows), pagination);
    }

    private mapCount(rows: unknown): number {
        const row = firstOrNull(rows as CountRow[]);

        return row ? Number(row.Count) : 0;
    }
}
