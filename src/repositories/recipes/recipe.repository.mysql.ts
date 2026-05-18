import { mapRecipe, mapRecipeDetail, mapRecipeDetailComments, mapRecipeDetailIngredient, mapRecipeDetailStep, mapRecipeDetailTag, mapRecipeDetailEquipment, mapRecipeIngredient, mapRecipeListItem, mapRatedRecipeListItem, mapRecipeStep, mapRecipeSummary, mapRecipeEquipment } from './recipe.mapper.js';
import { firstOrNull } from '../../utils/array.js';
import { createPaginatedResult, formatLimitOffsetClause } from '../../utils/pagination.js';

import type { RecipeRepository } from "./recipe.repository.interface.js";
import type { RatedRecipeListItem, RatedRecipeListItemRow, Recipe, RecipeDetail, RecipeDetailCommentRow, RecipeDetailCommentStatsRow, RecipeDetailIngredientRow, RecipeDetailRow, RecipeDetailStepRow, RecipeDetailTagRow, RecipeDetailEquipmentRow, RecipeIngredientRow, RecipeInput, RecipeListItem, RecipeListItemRow, RecipeRow, RecipeStepRow, RecipeSummary, RecipeTagRow, RecipeEquipmentRow, RecipeSearchFilters, UpdateRecipeInput } from "./recipe.types.js";
import type { PaginatedResult, PaginationOptions } from '../../utils/pagination.js';
import type { ResultSetHeader } from 'mysql2';
import type { Pool, PoolConnection } from 'mysql2/promise';

type CountRow = {
    Count: number | string;
};

type PublishedWhere = {
    clause: string;
    params: Array<string | number>;
};

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
            await this.insertEquipments(connection, recipeId, input);
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

            if (input.equipments !== undefined)
                await this.replaceEquipments(connection, input.id, input);

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
             SET Status = 'pending', Slug = ?, SubmittedAt = CURRENT_TIMESTAMP, ModeratedAt = NULL, ModeratedByUserId = NULL, RejectionReason = NULL
             WHERE Id = ?`,
            [slug, id]
        );

        const recipe = await this.findById(id);

        if (!recipe)
            throw new Error('Recipe submitted but cannot be reloaded');

        return recipe;
    }

    async archive(id: number): Promise<boolean> {
        const [result] = await this.db.execute<ResultSetHeader>(
            `UPDATE Recipes
             SET Status = 'archived', ArchivedAt = CURRENT_TIMESTAMP
             WHERE Id = ?`,
            [id]
        );

        return result.affectedRows > 0;
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

    async findByUserId(userId: number, pagination: PaginationOptions): Promise<PaginatedResult<RecipeSummary>> {
        const limitOffsetClause = formatLimitOffsetClause(pagination);

        const [countRows] = await this.db.execute(
            `SELECT COUNT(*) AS Count
             FROM Recipes
             WHERE UserId = ?`,
            [userId]
        );

        const [rows] = await this.db.execute(
            `SELECT Id, Title, Slug, Description, Status, CreatedAt, SubmittedAt, PublishedAt, RejectionReason, UpdatedAt
             FROM Recipes
             WHERE UserId = ?
             ORDER BY UpdatedAt DESC, Id DESC
             ${limitOffsetClause}`,
            [userId]
        );

        return createPaginatedResult((rows as RecipeRow[]).map(mapRecipeSummary), this.mapCount(countRows), pagination);
    }

    async findPublished(userId: number | null, pagination: PaginationOptions): Promise<PaginatedResult<RecipeListItem>> {
        return this.searchPublished(userId, {}, pagination);
    }

    async searchPublished(userId: number | null, filters: RecipeSearchFilters, pagination: PaginationOptions): Promise<PaginatedResult<RecipeListItem>> {
        const where = this.buildPublishedWhere(filters);
        const limitOffsetClause = formatLimitOffsetClause(pagination);

        const [countRows] = await this.db.execute(
            `SELECT COUNT(*) AS Count
             FROM Recipes AS r
             LEFT JOIN RecipeCategories AS rc ON rc.Id = r.CategoryId
             INNER JOIN Users AS u ON u.Id = r.UserId
             WHERE ${where.clause}`,
            where.params
        );

        const [rows] = await this.db.execute(
            `SELECT r.Id, r.Title, r.Slug, r.Description, r.RecipeCoverImage, rc.Name AS Category, r.PrepTimeMinutes, r.RestTimeMinutes, r.CookTimeMinutes, r.Servings, u.Username AS AuthorUsername, r.PublishedAt, CASE WHEN ? IS NULL THEN FALSE ELSE f.UserId IS NOT NULL END AS IsFavorite
             FROM Recipes AS r
             LEFT JOIN RecipeCategories AS rc ON rc.Id = r.CategoryId
             INNER JOIN Users AS u ON u.Id = r.UserId
             LEFT JOIN Favorites AS f ON f.RecipeId = r.Id AND f.UserId = ?
             WHERE ${where.clause}
             ORDER BY r.PublishedAt DESC, r.Id DESC
             ${limitOffsetClause}`,
            [userId, userId, ...where.params]
        );

        return createPaginatedResult((rows as RecipeListItemRow[]).map(mapRecipeListItem), this.mapCount(countRows), pagination);
    }

    async findPublishedByAuthorId(viewerUserId: number | null, authorUserId: number): Promise<RecipeListItem[]> {
        const [rows] = await this.db.execute(
            `SELECT r.Id, r.Title, r.Slug, r.Description, r.RecipeCoverImage, rc.Name AS Category, r.PrepTimeMinutes, r.RestTimeMinutes, r.CookTimeMinutes, r.Servings, u.Username AS AuthorUsername, r.PublishedAt, CASE WHEN ? IS NULL THEN FALSE ELSE f.UserId IS NOT NULL END AS IsFavorite
             FROM Recipes AS r
             LEFT JOIN RecipeCategories AS rc ON rc.Id = r.CategoryId
             INNER JOIN Users AS u ON u.Id = r.UserId
             LEFT JOIN Favorites AS f ON f.RecipeId = r.Id AND f.UserId = ?
             WHERE r.Status = 'published' AND r.UserId = ?
             ORDER BY r.PublishedAt DESC, r.Id DESC`,
            [viewerUserId, viewerUserId, authorUserId]
        );

        return (rows as RecipeListItemRow[]).map(mapRecipeListItem);
    }

    async findRecentPublished(userId: number | null, limit: number): Promise<RecipeListItem[]> {
        const limitOffsetClause = formatLimitOffsetClause({ page: 1, limit, offset: 0 });

        const [rows] = await this.db.execute(
            `SELECT r.Id, r.Title, r.Slug, r.Description, r.RecipeCoverImage, rc.Name AS Category, r.PrepTimeMinutes, r.RestTimeMinutes, r.CookTimeMinutes, r.Servings, u.Username AS AuthorUsername, r.PublishedAt, CASE WHEN ? IS NULL THEN FALSE ELSE f.UserId IS NOT NULL END AS IsFavorite
             FROM Recipes AS r
             LEFT JOIN RecipeCategories AS rc ON rc.Id = r.CategoryId
             INNER JOIN Users AS u ON u.Id = r.UserId
             LEFT JOIN Favorites AS f ON f.RecipeId = r.Id AND f.UserId = ?
             WHERE r.Status = 'published'
             ORDER BY r.PublishedAt DESC, r.Id DESC
             ${limitOffsetClause}`,
            [userId, userId]
        );

        return (rows as RecipeListItemRow[]).map(mapRecipeListItem);
    }

    async findTopRatedPublished(userId: number | null, limit: number): Promise<RatedRecipeListItem[]> {
        const limitOffsetClause = formatLimitOffsetClause({ page: 1, limit, offset: 0 });

        const [rows] = await this.db.execute(
            `SELECT r.Id, r.Title, r.Slug, r.Description, r.RecipeCoverImage, rc.Name AS Category, r.PrepTimeMinutes, r.RestTimeMinutes, r.CookTimeMinutes, r.Servings, u.Username AS AuthorUsername, r.PublishedAt, rating_stats.AverageRating, rating_stats.RatingsCount, CASE WHEN ? IS NULL THEN FALSE ELSE f.UserId IS NOT NULL END AS IsFavorite
             FROM Recipes AS r
             INNER JOIN (
                SELECT RecipeId, AVG(Rating) AS AverageRating, COUNT(*) AS RatingsCount
                FROM Comments
                WHERE DeletedAt IS NULL AND ModeratedAt IS NULL AND Rating IS NOT NULL
                GROUP BY RecipeId
             ) AS rating_stats ON rating_stats.RecipeId = r.Id
             LEFT JOIN RecipeCategories AS rc ON rc.Id = r.CategoryId
             INNER JOIN Users AS u ON u.Id = r.UserId
             LEFT JOIN Favorites AS f ON f.RecipeId = r.Id AND f.UserId = ?
             WHERE r.Status = 'published'
             ORDER BY rating_stats.AverageRating DESC, rating_stats.RatingsCount DESC, r.PublishedAt DESC, r.Id DESC
             ${limitOffsetClause}`,
            [userId, userId]
        );

        return (rows as RatedRecipeListItemRow[]).map(mapRatedRecipeListItem);
    }

    async findPublishedBySlug(userId: number | null, slug: string): Promise<RecipeDetail | null> {
        const [rows] = await this.db.execute(
            `SELECT r.Id, r.Title, r.Slug, r.Description, r.RecipeCoverImage, rc.Name AS Category, r.PrepTimeMinutes, r.RestTimeMinutes, r.CookTimeMinutes, r.Servings, u.Id AS AuthorId, u.Username AS AuthorUsername, r.PublishedAt, CASE WHEN ? IS NULL THEN FALSE ELSE f.UserId IS NOT NULL END AS IsFavorite
             FROM Recipes AS r
             INNER JOIN RecipeCategories AS rc ON rc.Id = r.CategoryId
             INNER JOIN Users AS u ON u.Id = r.UserId
             LEFT JOIN Favorites AS f ON f.RecipeId = r.Id AND f.UserId = ?
             WHERE r.Status = 'published' AND r.Slug = ?`,
            [userId, userId, slug]
        );

        const row = firstOrNull(rows as RecipeDetailRow[]);
        if (!row)
            return null;

        const recipe = mapRecipeDetail(row);
        const [ingredientRows, stepRows, equipmentRows, tagRows, commentRows, commentStats] = await Promise.all([
            this.findDetailIngredientsByRecipeId(recipe.id),
            this.findDetailStepsByRecipeId(recipe.id),
            this.findDetailEquipmentsByRecipeId(recipe.id),
            this.findDetailTagIdsByRecipeId(recipe.id),
            this.findDetailCommentsByRecipeId(recipe.id),
            this.findDetailCommentStatsByRecipeId(recipe.id)
        ]);

        recipe.ingredients = ingredientRows.map(mapRecipeDetailIngredient);
        recipe.steps = stepRows.map(mapRecipeDetailStep);
        recipe.equipments = equipmentRows.map(mapRecipeDetailEquipment);
        recipe.tags = tagRows.map(mapRecipeDetailTag);
        recipe.comments = mapRecipeDetailComments(commentRows);
        recipe.commentsCount = Number(commentStats.CommentsCount);
        recipe.averageRating = commentStats.AverageRating === null ? null : Number(commentStats.AverageRating);
        recipe.ratingsCount = Number(commentStats.RatingsCount);

        return recipe;
    }

    private buildPublishedWhere(filters: RecipeSearchFilters): PublishedWhere {
        const whereClauses = [`r.Status = 'published'`];
        const params: Array<string | number> = [];

        if (filters.q) {
            whereClauses.push('r.Title LIKE ?');
            params.push(`%${filters.q}%`);
        }

        if (filters.categoryId !== undefined) {
            whereClauses.push('r.CategoryId = ?');
            params.push(filters.categoryId);
        }

        if (filters.tagIds?.length) {
            const placeholders = filters.tagIds.map(() => '?').join(', ');
            whereClauses.push(`r.Id IN (
                SELECT rt.RecipeId
                FROM RecipeTags AS rt
                WHERE rt.TagId IN (${placeholders})
                GROUP BY rt.RecipeId
                HAVING COUNT(DISTINCT rt.TagId) = ?
            )`);
            params.push(...filters.tagIds, filters.tagIds.length);
        }

        if (filters.ingredientIds?.length) {
            const placeholders = filters.ingredientIds.map(() => '?').join(', ');
            whereClauses.push(`r.Id IN (
                SELECT ri.RecipeId
                FROM RecipeIngredients AS ri
                WHERE ri.IngredientId IN (${placeholders})
                GROUP BY ri.RecipeId
                HAVING COUNT(DISTINCT ri.IngredientId) = ?
            )`);
            params.push(...filters.ingredientIds, filters.ingredientIds.length);
        }

        if (filters.maxTotalTimeMinutes !== undefined) {
            whereClauses.push('(r.PrepTimeMinutes + COALESCE(r.RestTimeMinutes, 0) + COALESCE(r.CookTimeMinutes, 0)) <= ?');
            params.push(filters.maxTotalTimeMinutes);
        }

        return {
            clause: whereClauses.join(' AND '),
            params
        };
    }

    private mapCount(rows: unknown): number {
        const row = firstOrNull(rows as CountRow[]);

        return row ? Number(row.Count) : 0;
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
            this.findEquipmentsByRecipeId(recipe.id),
            this.findTagIdsByRecipeId(recipe.id)
        ]);

        recipe.ingredients = ingredientRows.map(mapRecipeIngredient);
        recipe.steps = stepRows.map(mapRecipeStep);
        recipe.equipments = equipmentRows.map(mapRecipeEquipment);
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

    private async insertEquipments(connection: PoolConnection, recipeId: number, input: RecipeInput): Promise<void> {
        if (!input.equipments?.length)
            return;

        await connection.query(
            `INSERT INTO RecipeEquipments (RecipeId, EquipmentId)
             VALUES ?`,
            [input.equipments.map((equipment) => [recipeId, equipment.equipmentId])]
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

    private async replaceEquipments(connection: PoolConnection, recipeId: number, input: RecipeInput): Promise<void> {
        await connection.execute(
            `DELETE FROM RecipeEquipments
             WHERE RecipeId = ?`,
            [recipeId]
        );

        if (!input.equipments?.length)
            return;

        await connection.query(
            `INSERT INTO RecipeEquipments (RecipeId, EquipmentId)
             VALUES ?`,
            [input.equipments.map((equipment) => [recipeId, equipment.equipmentId])]
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

    private async findEquipmentsByRecipeId(recipeId: number): Promise<RecipeEquipmentRow[]> {
        const [rows] = await this.db.execute(
            `SELECT EquipmentId
             FROM RecipeEquipments
             WHERE RecipeId = ?`,
            [recipeId]
        );

        return rows as RecipeEquipmentRow[];
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

    private async findDetailEquipmentsByRecipeId(recipeId: number): Promise<RecipeDetailEquipmentRow[]> {
        const [rows] = await this.db.execute(
            `SELECT e.Id, e.Name, e.Slug
             FROM RecipeEquipments AS re
             INNER JOIN Equipments AS e ON e.Id = re.EquipmentId
             WHERE re.RecipeId = ?`,
            [recipeId]
        );

        return rows as RecipeDetailEquipmentRow[];
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

    private async findDetailCommentsByRecipeId(recipeId: number): Promise<RecipeDetailCommentRow[]> {
        const [rows] = await this.db.execute(
            `SELECT c.Id, u.Id AS AuthorId, u.Username AS AuthorUsername, c.ParentCommentId, c.ModeratedAt, c.DeletedAt, c.Rating, c.Comment, c.CreatedAt, c.UpdatedAt
             FROM Comments AS c
             INNER JOIN Users AS u ON u.Id = c.UserId
             WHERE c.RecipeId = ?
             ORDER BY COALESCE(c.ParentCommentId, c.Id), c.ParentCommentId IS NOT NULL, c.CreatedAt`,
            [recipeId]
        );

        return rows as RecipeDetailCommentRow[];
    }

    private async findDetailCommentStatsByRecipeId(recipeId: number): Promise<RecipeDetailCommentStatsRow> {
        const [rows] = await this.db.execute(
            `SELECT COUNT(*) AS CommentsCount,
                    AVG(CASE WHEN DeletedAt IS NULL AND ModeratedAt IS NULL AND Rating IS NOT NULL THEN Rating END) AS AverageRating,
                    COUNT(CASE WHEN DeletedAt IS NULL AND ModeratedAt IS NULL AND Rating IS NOT NULL THEN 1 END) AS RatingsCount
             FROM Comments
             WHERE RecipeId = ?`,
            [recipeId]
        );

        const row = firstOrNull(rows as RecipeDetailCommentStatsRow[]);
        if (!row)
            return { CommentsCount: 0, AverageRating: null, RatingsCount: 0 } as RecipeDetailCommentStatsRow;

        return row;
    }
}
