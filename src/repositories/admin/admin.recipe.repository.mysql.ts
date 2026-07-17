import { mapRecipeEquipment, mapRecipeIngredient, mapRecipePending, mapRecipeStep, mapRecipeTag } from './admin.recipe.mapper.js';
import { firstOrNull } from '../../utils/array.js';
import { mapRecipe } from '../recipes/recipe.mapper.js';

import type { AdminRecipeRepository } from "./admin.recipe.repository.interface.js";
import type { AdminRecipeAuditState, AdminRecipeAuditStateRow, RecipeAdmin, RecipeAdminRow, RecipeIngredientRow, RecipePending, RecipePendingRow, RecipeStepRow, RecipeTagRow, RecipeEquipmentRow } from './admin.recipe.types.js';
import type { Queryable } from '../../db/query.js';
import type { PublicImageUrlBuilder } from '../recipe-images/recipe-image.types.js';
import type { ResultSetHeader } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

export class AdminRecipeRepositoryMysql implements AdminRecipeRepository {
    constructor(private readonly db: Queryable, private readonly getPublicImageUrl: PublicImageUrlBuilder = missingPublicImageUrlBuilder) { }

    async findPendingForAdmin(): Promise<RecipePending[]> {
        const [rows] = await this.db.execute(
            `SELECT  r.Id, u.Username AS User, rc.Name AS Category, r.Title, r.Slug, r.Description, SubmittedAt
             FROM Recipes AS r
             LEFT JOIN Users AS u ON r.UserId = u.Id
             LEFT JOIN RecipeCategories AS rc ON r.CategoryId = rc.Id
             WHERE r.Status = 'pending'`
        );

        return (rows as RecipePendingRow[]).map(mapRecipePending);
    }

    async countPendingForAdmin(): Promise<number> {
        const [rows] = await this.db.execute(
            `SELECT COUNT(*) AS Count
             FROM Recipes
             WHERE Status = 'pending'`
        );

        const row = firstOrNull(rows as { Count: number }[]);
        return row?.Count ?? 0;
    }

    async findByIdForAdmin(id: number): Promise<RecipeAdmin | null> {
        const [rows] = await this.db.execute(
            `SELECT r.Id, r.UserId, u.Username, r.CategoryId, rc.Name AS Category, r.Title, r.Slug, r.Description, r.PrepTimeMinutes, r.RestTimeMinutes, r.CookTimeMinutes, r.Servings, r.Status, r.CreatedAt, r.SubmittedAt, r.ModeratedAt, r.ModeratedByUserId, r.PublishedAt, r.ArchivedAt, r.RejectionReason, r.UpdatedAt,
                    ri.Id AS CoverImageId,
                    ri.LargeStorageKey AS CoverImageLargeStorageKey,
                    ri.MediumStorageKey AS CoverImageMediumStorageKey,
                    ri.ThumbnailStorageKey AS CoverImageThumbnailStorageKey,
                    ri.LargeWidth AS CoverImageWidth,
                    ri.LargeHeight AS CoverImageHeight,
                    ri.AltText AS CoverImageAltText
             FROM Recipes AS r
             INNER JOIN Users AS u ON r.UserId = u.Id
             LEFT JOIN RecipeCategories AS rc ON r.CategoryId = rc.Id
             LEFT JOIN RecipeImages AS ri ON ri.RecipeId = r.Id
             WHERE r.Id = ?`,
            [id]
        );

        const row = firstOrNull(rows as RecipeAdminRow[]);
        if (!row)
            return null;

        const recipe = mapRecipe(row, this.getPublicImageUrl);
        const [ingredientRows, stepRows, equipmentRows, tagRows] = await Promise.all([
            this.findIngredientsByRecipeId(recipe.id),
            this.findStepsByRecipeId(recipe.id),
            this.findEquipmentsByRecipeId(recipe.id),
            this.findTagsByRecipeId(recipe.id)
        ]);
        const { tagIds, ...recipeWithoutTagIds } = recipe;
        void tagIds;

        return {
            ...recipeWithoutTagIds,
            user: row.Username,
            category: row.Category,
            tags: tagRows.map(mapRecipeTag),
            ingredients: ingredientRows.map(mapRecipeIngredient),
            steps: stepRows.map(mapRecipeStep),
            equipments: equipmentRows.map(mapRecipeEquipment)
        };
    }

    async findAuditStateById(id: number, db: PoolConnection): Promise<AdminRecipeAuditState | null> {
        const [rows] = await db.execute(
            `SELECT Id, UserId, CategoryId, Title, Slug, Status, ModeratedByUserId, RejectionReason
             FROM Recipes
             WHERE Id = ?
             FOR UPDATE`,
            [id]
        );
        const row = firstOrNull(rows as AdminRecipeAuditStateRow[]);

        return row ? {
            id: row.Id,
            userId: row.UserId,
            categoryId: row.CategoryId,
            title: row.Title,
            slug: row.Slug,
            status: row.Status,
            moderatedByUserId: row.ModeratedByUserId,
            rejectionReason: row.RejectionReason
        } : null;
    }

    async publish(id: number, moderatedByUserId: number, db?: PoolConnection): Promise<boolean> {
        const [result] = await (db ?? this.db).execute<ResultSetHeader>(
            `UPDATE Recipes
                 SET Status = ?, PublishedAt = CURRENT_TIMESTAMP, ModeratedByUserId = ?
                 WHERE Id = ?`,
            ['published', moderatedByUserId, id]
        );

        return result.affectedRows > 0;
    }

    async reject(id: number, moderatedByUserId: number, rejectionReason: string, db?: PoolConnection): Promise<boolean> {
        const [result] = await (db ?? this.db).execute<ResultSetHeader>(
            `UPDATE Recipes
                 SET Status = ?, ModeratedAt = CURRENT_TIMESTAMP, ModeratedByUserId = ?, RejectionReason = ?
                 WHERE Id = ?`,
            ['rejected', moderatedByUserId, rejectionReason, id]
        );

        return result.affectedRows > 0;
    }

    async delete(id: number, db?: PoolConnection): Promise<boolean> {
        const [result] = await (db ?? this.db).execute<ResultSetHeader>(
            `DELETE FROM Recipes
             WHERE Id = ?`,
            [id]
        );

        return result.affectedRows > 0;
    }

    private async findIngredientsByRecipeId(recipeId: number): Promise<RecipeIngredientRow[]> {
        const [rows] = await this.db.execute(
            `SELECT i.Id, i.Name, ri.Quantity, ri.Unit, ri.Note, ri.SortOrder
             FROM RecipeIngredients AS ri
             INNER JOIN Ingredients AS i ON ri.IngredientId = i.Id
             WHERE RecipeId = ?`,
            [recipeId]
        );

        return rows as RecipeIngredientRow[];
    }

    private async findStepsByRecipeId(recipeId: number): Promise<RecipeStepRow[]> {
        const [rows] = await this.db.execute(
            `SELECT StepNumber, Description
             FROM RecipeSteps
             WHERE RecipeId = ?`,
            [recipeId]
        );

        return rows as RecipeStepRow[];
    }

    private async findEquipmentsByRecipeId(recipeId: number): Promise<RecipeEquipmentRow[]> {
        const [rows] = await this.db.execute(
            `SELECT e.Id, e.Name
             FROM RecipeEquipments AS re
             INNER JOIN Equipments AS e ON re.EquipmentId = e.Id
             WHERE RecipeId = ?`,
            [recipeId]
        );

        return rows as RecipeEquipmentRow[];
    }

    private async findTagsByRecipeId(recipeId: number): Promise<RecipeTagRow[]> {
        const [rows] = await this.db.execute(
            `SELECT t.Id, t.Name
             FROM RecipeTags AS rt
             INNER JOIN Tags AS t ON rt.TagId = t.Id
             WHERE rt.RecipeId = ?
             ORDER BY t.Name ASC`,
            [recipeId]
        );

        return rows as RecipeTagRow[];
    }
}

const missingPublicImageUrlBuilder: PublicImageUrlBuilder = () => {
    throw new Error('AdminRecipeRepositoryMysql requires a public image URL builder when an image exists');
};
