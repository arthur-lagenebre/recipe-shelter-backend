import { mapRecipe, mapRecipeDetail, mapRecipeDetailIngredient, mapRecipeDetailStep, mapRecipeDetailTag, mapRecipeDetailUtensil, mapRecipeIngredient, mapRecipeListItem, mapRecipeStep, mapRecipeSummary, mapRecipeUtensil } from './recipe.mapper.js';
import { firstOrNull } from '../../utils/array.js';

import type { RecipeRepository } from "./recipe.repository.interface.js";
import type { Recipe, RecipeDetail, RecipeDetailIngredientRow, RecipeDetailStepRow, RecipeDetailTagRow, RecipeDetailUtensilRow, RecipeIngredientRow, RecipeInput, RecipeListItem, RecipeListItemRow, RecipeRow, RecipeStepRow, RecipeSummary, RecipeTagRow, RecipeUtensilRow, UpdateRecipeInput } from "./recipe.types.js";
import type { ResultSetHeader } from 'mysql2';
import type { Pool, PoolConnection } from 'mysql2/promise';

export class RecipeRepositoryMysql implements RecipeRepository {
    constructor(private readonly db: Pool) { }

    async create(input: RecipeInput): Promise<Recipe> {
        const connection = await this.db.getConnection();

        try {
            await connection.beginTransaction();

            const [result] = await connection.execute<ResultSetHeader>(
                `INSERT INTO Recipes (UserId, CategoryId, Title, Slug, Description, RecipeCoverImage, PrepTimeMinutes, RestTimeMinutes, CookTimeMinutes, Servings, Status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [input.userId, input.categoryId ?? null, input.title, input.slug, input.description ?? '', input.coverImageUrl ?? null, input.prepTimeMinutes ?? 0, input.restTimeMinutes ?? null, input.cookTimeMinutes ?? null, input.servings ?? 1, 'draft']
            );

            const recipeId = Number(result.insertId);

            await this.insertIngredients(connection, recipeId, input);
            await this.insertSteps(connection, recipeId, input);
            await this.insertUtensils(connection, recipeId, input);
            await this.insertTags(connection, recipeId, input);

            await connection.commit();

            const createdRecipe = await this.findById(recipeId);

            if (!createdRecipe)
                throw new Error('Recipe created but cannot be reloaded');

            return createdRecipe;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async updateDraft(input: UpdateRecipeInput): Promise<Recipe> {
        const connection = await this.db.getConnection();

        try {
            await connection.beginTransaction();

            const updateFields: string[] = [];
            const updateValues: Array<string | number | null> = [];

            if (input.categoryId !== undefined) {
                updateFields.push('CategoryId = ?');
                updateValues.push(input.categoryId);
            }

            if (input.title !== undefined) {
                updateFields.push('Title = ?');
                updateValues.push(input.title);
            }

            if (input.description !== undefined) {
                updateFields.push('Description = ?');
                updateValues.push(input.description);
            }

            if (input.coverImageUrl !== undefined) {
                updateFields.push('RecipeCoverImage = ?');
                updateValues.push(input.coverImageUrl);
            }

            if (input.prepTimeMinutes !== undefined) {
                updateFields.push('PrepTimeMinutes = ?');
                updateValues.push(input.prepTimeMinutes);
            }

            if (input.restTimeMinutes !== undefined) {
                updateFields.push('RestTimeMinutes = ?');
                updateValues.push(input.restTimeMinutes);
            }

            if (input.cookTimeMinutes !== undefined) {
                updateFields.push('CookTimeMinutes = ?');
                updateValues.push(input.cookTimeMinutes);
            }

            if (input.servings !== undefined) {
                updateFields.push('Servings = ?');
                updateValues.push(input.servings);
            }

            if (updateFields.length) {
                await connection.execute(
                    `UPDATE Recipes
                     SET ${updateFields.join(', ')}
                     WHERE Id = ?`,
                    [...updateValues, input.id]
                );
            }

            if (input.ingredients !== undefined)
                await this.replaceIngredients(connection, input.id, input);

            if (input.steps !== undefined)
                await this.replaceSteps(connection, input.id, input);

            if (input.utensils !== undefined)
                await this.replaceUtensils(connection, input.id, input);

            if (input.tagIds !== undefined)
                await this.replaceTags(connection, input.id, input);

            await connection.commit();

            const recipe = await this.findById(input.id);

            if (!recipe)
                throw new Error('Recipe updated but cannot be reloaded');

            return recipe;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async submit(id: number, slug: string): Promise<Recipe> {
        await this.db.execute(
            `UPDATE Recipes
             SET Status = ?, Slug = ?, SubmittedAt = CURRENT_TIMESTAMP, ModeratedAt = NULL, ModeratedByUserId = NULL, RejectionReason = NULL
             WHERE Id = ?`,
            ['pending', slug, id]
        );

        const recipe = await this.findById(id);

        if (!recipe)
            throw new Error('Recipe submitted but cannot be reloaded');

        return recipe;
    }

    async existsBySlug(slug: string): Promise<boolean> {
        const [rows] = await this.db.execute(
            `SELECT 1
             FROM Recipes
             WHERE Slug = ?
             LIMIT 1`,
            [slug]
        );

        return !!firstOrNull(rows as Array<{ 1: number }>);
    }

    async findById(id: number): Promise<Recipe | null> {
        return this.findOne(
            `SELECT Id, UserId, CategoryId, Title, Slug, Description, RecipeCoverImage, PrepTimeMinutes, RestTimeMinutes, CookTimeMinutes, Servings, Status, CreatedAt, SubmittedAt, ModeratedAt, ModeratedByUserId, PublishedAt, ArchivedAt, RejectionReason, UpdatedAt
             FROM Recipes
             WHERE Id = ?`,
            [id]
        );
    }

    async findByUserId(userId: number): Promise<RecipeSummary[]> {
        const [rows] = await this.db.execute(
            `SELECT Id, Title, Slug, Description, Status, CreatedAt, SubmittedAt, PublishedAt, RejectionReason, UpdatedAt
             FROM Recipes
             WHERE UserId = ?`,
            [userId]
        );

        return (rows as RecipeRow[]).map(mapRecipeSummary);
    }

    async findPublished(userId: number | null): Promise<RecipeListItem[]> {
        const [rows] = await this.db.execute(
            `SELECT r.Id, r.Title, r.Slug, r.Description, r.RecipeCoverImage, rc.Name AS Category, r.PrepTimeMinutes, r.RestTimeMinutes, r.CookTimeMinutes, r.Servings, u.UserName AS AuthorUsername, r.PublishedAt,
                    CASE WHEN ? IS NULL THEN FALSE ELSE f.UserId IS NOT NULL END AS IsFavorite
             FROM Recipes AS r
             INNER JOIN RecipeCategories AS rc ON rc.Id = r.CategoryId
             INNER JOIN Users AS u ON u.Id = r.UserId
             LEFT JOIN Favorites AS f ON f.RecipeId = r.Id AND f.UserId = ?
             WHERE r.Status = 'published'`,
            [userId, userId]
        );

        return (rows as RecipeListItemRow[]).map(mapRecipeListItem);
    }

    async findPublishedBySlug(userId: number | null, slug: string): Promise<RecipeDetail | null> {
        const [rows] = await this.db.execute(
            `SELECT r.Id, r.Title, r.Slug, r.Description, r.RecipeCoverImage, rc.Name AS Category, r.PrepTimeMinutes, r.RestTimeMinutes, r.CookTimeMinutes, r.Servings, u.UserName AS AuthorUsername, r.PublishedAt,
                    CASE WHEN ? IS NULL THEN FALSE ELSE f.UserId IS NOT NULL END AS IsFavorite
             FROM Recipes AS r
             INNER JOIN RecipeCategories AS rc ON rc.Id = r.CategoryId
             INNER JOIN Users AS u ON u.Id = r.UserId
             LEFT JOIN Favorites AS f ON f.RecipeId = r.Id AND f.UserId = ?
             WHERE r.Status = 'published' AND r.Slug = ?`,
             [userId, userId, slug]
        );

        const row = firstOrNull(rows as RecipeListItemRow[]);
        if (!row)
            return null;

        const recipe = mapRecipeDetail(row);
        const [ingredientRows, stepRows, equipmentRows, tagRows] = await Promise.all([
            this.findDetailIngredientsByRecipeId(recipe.id),
            this.findDetailStepsByRecipeId(recipe.id),
            this.findDetailUtensilsByRecipeId(recipe.id),
            this.findDetailTagIdsByRecipeId(recipe.id)
        ]);

        recipe.ingredients = ingredientRows.map(mapRecipeDetailIngredient);
        recipe.steps = stepRows.map(mapRecipeDetailStep);
        recipe.equipments = equipmentRows.map(mapRecipeDetailUtensil);
        recipe.tags = tagRows.map(mapRecipeDetailTag);

        return recipe;
    }

    private async findOne(sql: string, params: Array<string | number | null>): Promise<Recipe | null> {
        const [rows] = await this.db.execute(sql, params);

        const row = firstOrNull(rows as RecipeRow[]);
        if (!row)
            return null;

        const recipe = mapRecipe(row);
        const [ingredientRows, stepRows, equipmentRows, tagIds] = await Promise.all([
            this.findIngredientsByRecipeId(recipe.id),
            this.findStepsByRecipeId(recipe.id),
            this.findUtensilsByRecipeId(recipe.id),
            this.findTagIdsByRecipeId(recipe.id)
        ]);

        recipe.ingredients = ingredientRows.map(mapRecipeIngredient);
        recipe.steps = stepRows.map(mapRecipeStep);
        recipe.utensils = equipmentRows.map(mapRecipeUtensil);
        recipe.tagIds = tagIds;

        return recipe;
    }

    private async insertIngredients(connection: PoolConnection, recipeId: number, input: RecipeInput): Promise<void> {
        if (!input.ingredients?.length)
            return;

        await connection.query(
            `INSERT INTO RecipeIngredients (RecipeId, IngredientId, Quantity, Unit, Note, SortOrder)
             VALUES ?`,
            [input.ingredients.map((ingredient) => [recipeId, ingredient.ingredientId, ingredient.quantity, ingredient.unit, ingredient.note ?? null, ingredient.sortOrder ?? 1])]
        );
    }

    private async insertSteps(connection: PoolConnection, recipeId: number, input: RecipeInput): Promise<void> {
        if (!input.steps?.length)
            return;

        await connection.query(
            `INSERT INTO RecipeSteps (RecipeId, StepNumber, Description)
             VALUES ?`,
            [input.steps.map((step, index) => [recipeId, step.stepNumber ?? index + 1, step.description])]
        );
    }

    private async insertUtensils(connection: PoolConnection, recipeId: number, input: RecipeInput): Promise<void> {
        if (!input.utensils?.length)
            return;

        await connection.query(
            `INSERT INTO RecipeEquipments (RecipeId, EquipmentId)
             VALUES ?`,
            [input.utensils.map((utensil) => [recipeId, utensil.utensilId])]
        );
    }

    private async insertTags(connection: PoolConnection, recipeId: number, input: RecipeInput): Promise<void> {
        if (!input.tagIds?.length)
            return;

        await connection.query(
            `INSERT INTO RecipeTags (RecipeId, TagId)
             VALUES ?`,
            [input.tagIds.map((tagId) => [recipeId, tagId])]
        );
    }

    private async replaceIngredients(connection: PoolConnection, recipeId: number, input: RecipeInput): Promise<void> {
        await connection.execute(
            `DELETE FROM RecipeIngredients
             WHERE RecipeId = ?`,
            [recipeId]
        );

        if (!input.ingredients?.length)
            return;

        await connection.query(
            `INSERT INTO RecipeIngredients (RecipeId, IngredientId, Quantity, Unit, Note, SortOrder)
             VALUES ?`,
            [input.ingredients.map((ingredient) => [recipeId, ingredient.ingredientId, ingredient.quantity, ingredient.unit, ingredient.note ?? null, ingredient.sortOrder ?? 1])]
        );
    }

    private async replaceSteps(connection: PoolConnection, recipeId: number, input: RecipeInput): Promise<void> {
        await connection.execute(
            `DELETE FROM RecipeSteps
             WHERE RecipeId = ?`,
            [recipeId]
        );

        if (!input.steps?.length)
            return;

        await connection.query(
            `INSERT INTO RecipeSteps (RecipeId, StepNumber, Description)
             VALUES ?`,
            [input.steps.map((step, index) => [recipeId, step.stepNumber ?? index + 1, step.description])]
        );
    }

    private async replaceUtensils(connection: PoolConnection, recipeId: number, input: RecipeInput): Promise<void> {
        await connection.execute(
            `DELETE FROM RecipeEquipments
             WHERE RecipeId = ?`,
            [recipeId]
        );

        if (!input.utensils?.length)
            return;

        await connection.query(
            `INSERT INTO RecipeEquipments (RecipeId, EquipmentId)
             VALUES ?`,
            [input.utensils.map((utensil) => [recipeId, utensil.utensilId])]
        );
    }

    private async replaceTags(connection: PoolConnection, recipeId: number, input: RecipeInput): Promise<void> {
        await connection.execute(
            `DELETE FROM RecipeTags
             WHERE RecipeId = ?`,
            [recipeId]
        );

        if (!input.tagIds?.length)
            return;

        await connection.query(
            `INSERT INTO RecipeTags (RecipeId, TagId)
             VALUES ?`,
            [input.tagIds.map((tagId) => [recipeId, tagId])]
        );
    }

    private async findIngredientsByRecipeId(recipeId: number): Promise<RecipeIngredientRow[]> {
        const [rows] = await this.db.execute(
            `SELECT IngredientId, Quantity, Unit, Note, SortOrder
             FROM RecipeIngredients
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
            `SELECT EquipmentId AS UtensilId
             FROM RecipeEquipments
             WHERE RecipeId = ?`,
            [recipeId]
        );

        return rows as RecipeUtensilRow[];
    }

    private async findTagIdsByRecipeId(recipeId: number): Promise<number[]> {
        const [rows] = await this.db.execute(
            `SELECT TagId
             FROM RecipeTags
             WHERE RecipeId = ?`,
            [recipeId]
        );

        return (rows as RecipeTagRow[]).map((row) => row.TagId);
    }

    private async findDetailIngredientsByRecipeId(recipeId: number): Promise<RecipeDetailIngredientRow[]> {
        const [rows] = await this.db.execute(
            `SELECT i.Id, i.Name, i.Slug, ri.Quantity, ri.Unit, ri.Note, ri.SortOrder
             FROM RecipeIngredients AS ri
             INNER JOIN Ingredients AS i ON i.Id = ri.IngredientId
             WHERE ri.RecipeId =  ?`,
            [recipeId]
        );

        return rows as RecipeDetailIngredientRow[];
    }

    private async findDetailStepsByRecipeId(recipeId: number): Promise<RecipeDetailStepRow[]> {
        const [rows] = await this.db.execute(
            `SELECT StepNumber, Description
             FROM RecipeSteps
             WHERE RecipeId = ?`,
            [recipeId]
        );

        return rows as RecipeDetailStepRow[];
    }

    private async findDetailUtensilsByRecipeId(recipeId: number): Promise<RecipeDetailUtensilRow[]> {
        const [rows] = await this.db.execute(
            `SELECT e.Id, e.Name, e.Slug
             FROM RecipeEquipments AS re
             INNER JOIN Equipments AS e ON e.Id = re.EquipmentId
             WHERE re.RecipeId = ?`,
            [recipeId]
        );

        return rows as RecipeDetailUtensilRow[];
    }

    private async findDetailTagIdsByRecipeId(recipeId: number): Promise<RecipeDetailTagRow[]> {
        const [rows] = await this.db.execute(
            `SELECT t.Id, t.Name, t.Slug
             FROM RecipeTags AS rt
             INNER JOIN Tags AS t ON t.Id = rt.TagId
             WHERE rt.RecipeId = ?`,
            [recipeId]
        );

        return rows as RecipeDetailTagRow[];
    }
}
