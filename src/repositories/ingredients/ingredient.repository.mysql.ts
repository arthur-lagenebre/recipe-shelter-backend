import { mapIngredient } from './ingredient.mapper.js';
import { firstOrNull } from '../../utils/array.js';

import type { IngredientRepository } from './ingredient.repository.interface.js';
import type { Ingredient, IngredientRow } from './ingredient.types.js';
import type { Pool } from 'mysql2/promise';

export class IngredientRepositoryMysql implements IngredientRepository {
    constructor(private readonly db: Pool) {}

    async findAll(): Promise<Ingredient[]> {
        const [rows] = await this.db.execute(
            `SELECT Id, Name, NormalizedName, Slug, Status, MergedIntoIngredientId, CreatedAt, UpdatedAt
             FROM Ingredients
             WHERE Status = 'active'
             ORDER BY Name ASC`
        );

        return (rows as IngredientRow[]).map(mapIngredient);
    }

    async findById(id: number): Promise<Ingredient | null> {
        const [rows] = await this.db.execute(
            `SELECT Id, Name, NormalizedName, Slug, Status, MergedIntoIngredientId, CreatedAt, UpdatedAt
             FROM Ingredients
             WHERE Id = ?`,
            [id]
        );

        const row = firstOrNull(rows as IngredientRow[]);
        return row ? mapIngredient(row) : null;
    }
}
