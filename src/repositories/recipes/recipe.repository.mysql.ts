import { mapRecipe, mapRecipeIngredient, mapRecipeStep, mapRecipeSummary, mapRecipeUtensil } from './recipe.mapper.js';
import { firstOrNull } from '../../utils/array.js';

import type { RecipeRepository } from "./recipe.repository.interface.js";
import type { Recipe, RecipeIngredientRow, RecipeInput, RecipeRow, RecipeStepRow, RecipeSummary, RecipeTagRow, RecipeUtensilRow, UpdateRecipeInput } from "./recipe.types.js";
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
            `SELECT Id, UserId, CategoryId, Title, Slug, Description, RecipeCoverImage, PrepTimeMinutes, RestTimeMinutes, CookTimeMinutes, Servings, Status, CreatedAt, SubmittedAt, ModeratedAt, ModeratedByUserId, PublishedAt, ArchivedAt, RejectionReason, UpdatedAt
             FROM Recipes
             WHERE UserId = ?`,
            [userId]
        );

        const recipeRows = rows as RecipeRow[];

        return Promise.all(recipeRows.map((row) => this.findOneSummary(
            `SELECT Id, Title, Slug, Description, Status, CreatedAt, SubmittedAt, PublishedAt, RejectionReason, UpdatedAt
             FROM Recipes
             WHERE Id = ?`,
            [row.Id]
        ))).then((recipeSummaries) => recipeSummaries.filter((recipeSummary): recipeSummary is RecipeSummary => recipeSummary !== null));
    }

    private async findOneSummary(sql: string, params: Array<string | number | null>): Promise<RecipeSummary | null> {
        const [rows] = await this.db.execute(sql, params);

        const row = firstOrNull(rows as RecipeRow[]);
        if (!row)
            return null;

        return mapRecipeSummary(row);
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
}
