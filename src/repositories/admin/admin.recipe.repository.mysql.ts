import { mapRecipeIngredient, mapRecipePending, mapRecipeStep, mapRecipeUtensil } from './admin.recipe.mapper.js';
import { type AdminRecipeRepository } from "./admin.recipe.repository.interface.js";
import { type RecipeAdmin, type RecipeAdminRow, type RecipeIngredientRow, type RecipePending, type RecipePendingRow, type RecipeStepRow, type RecipeUtensilRow } from './admin.recipe.types.js';
import { firstOrNull } from '../../utils/array.js';
import { mapRecipe } from '../recipes/recipe.mapper.js';

import type { Pool } from 'mysql2/promise';

export class AdminRecipeRepositoryMysql implements AdminRecipeRepository {
    constructor(private readonly db: Pool) { }

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

    async findByIdForAdmin(id: number): Promise<RecipeAdmin | null> {
        const [rows] = await this.db.execute(
            `SELECT r.Id, r.userId, u.Username, r.CategoryId, rc.Name AS Category, r.Title, r.Slug, r.Description, r.PrepTimeMinutes, r.RestTimeMinutes, r.CookTimeMinutes, r.Servings, r.Status, r.CreatedAt, r.SubmittedAt, r.ModeratedAt, r.ModeratedByUserId, r.PublishedAt, r.ArchivedAt, r.RejectionReason, r.UpdatedAt
             FROM Recipes AS r
             INNER JOIN Users AS u ON r.UserId = u.Id
             LEFT JOIN RecipeCategories AS rc ON r.CategoryId = rc.Id
             WHERE r.Id = ?`,
            [id]
        );

        const row = firstOrNull(rows as RecipeAdminRow[]);
        if (!row)
            return null;

        const recipe = mapRecipe(row);
        const [ingredientRows, stepRows, equipmentRows] = await Promise.all([
            this.findIngredientsByRecipeId(recipe.id),
            this.findStepsByRecipeId(recipe.id),
            this.findUtensilsByRecipeId(recipe.id)
        ]);

        return {
            ...recipe,
            user: row.Username,
            category: row.Category,
            ingredients: ingredientRows.map(mapRecipeIngredient),
            steps: stepRows.map(mapRecipeStep),
            utensils: equipmentRows.map(mapRecipeUtensil)
        };
    }

    async publish(id: number, moderatedByUserId: number): Promise<boolean> {
        await this.db.execute(
            `UPDATE Recipes
                 SET Status = ?, PublishedAt = CURRENT_TIMESTAMP, ModeratedByUserId = ?
                 WHERE Id = ?`,
            ['published', moderatedByUserId, id]
        );

        return true;
    }

    async reject(id: number, moderatedByUserId: number, rejectionReason: string): Promise<boolean> {
        await this.db.execute(
            `UPDATE Recipes
                 SET Status = ?, ModeratedAt = CURRENT_TIMESTAMP, ModeratedByUserId = ?, RejectionReason = ?
                 WHERE Id = ?`,
            ['rejected', moderatedByUserId, rejectionReason, id]
        );

        return true;
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

    private async findUtensilsByRecipeId(recipeId: number): Promise<RecipeUtensilRow[]> {
        const [rows] = await this.db.execute(
            `SELECT e.Id, e.Name
             FROM RecipeEquipments AS re
             INNER JOIN Equipments AS e ON re.EquipmentId = e.Id
             WHERE RecipeId = ?`,
            [recipeId]
        );

        return rows as RecipeUtensilRow[];
    }
}