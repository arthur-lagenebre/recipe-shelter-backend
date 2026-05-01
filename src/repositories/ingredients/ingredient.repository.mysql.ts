
import { mapIngredient } from './ingredient.mapper.js';
import { firstOrNull } from '../../utils/array.js';

import type { IngredientRepository } from "./ingredient.repository.interface.js";
import type { Ingredient, IngredientRow } from "./ingredient.types.js";
import type { Pool } from 'mysql2/promise';

export class IngredientRepositoryMysql implements IngredientRepository {
    constructor(private readonly db: Pool) { }

    async findAll(): Promise<Ingredient[]> {
        const [rows] = await this.db.execute(
            `SELECT i.Id AS id, i.Name AS name, i.Slug AS slug, i.CategoryId AS categoryId, ic.Name AS category
             FROM Ingredients AS i
             LEFT JOIN IngredientCategories AS ic ON ic.Id = i.CategoryId`);

        return (rows as IngredientRow[]).map(mapIngredient);
    }

    async findById(id: number): Promise<Ingredient | null> {
        const [rows] = await this.db.execute(
            `SELECT i.Id AS id, i.Name AS name, i.Slug AS slug, i.CategoryId AS categoryId, ic.Name AS category
             FROM Ingredients AS i
             LEFT JOIN IngredientCategories AS ic ON ic.Id = i.CategoryId
             WHERE i.Id = ?`,
            [id]
        );

        const row = firstOrNull(rows as IngredientRow[]);
        return row ? mapIngredient(row) : null;
    }
}
