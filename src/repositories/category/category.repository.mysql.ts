
import { mapCategory } from './category.mapper.js';
import { firstOrNull } from '../../utils/array.js';

import type { CategoryRepository } from "./category.repository.interface.js";
import type { Category, CategoryRow } from "./category.types.js";
import type { Pool } from 'mysql2/promise';

export class CategoryRepositoryMysql implements CategoryRepository {
    constructor(private readonly db: Pool) { }

    async findAll(): Promise<Category[]> {
        const [rows] = await this.db.execute(
            `SELECT Id, Name, Slug, IconName, CreatedAt, UpdatedAt
             FROM RecipeCategories`);

        return (rows as CategoryRow[]).map(mapCategory);
    }

    async findById(id: number): Promise<Category | null> {
        const [rows] = await this.db.execute(
            `SELECT Id, Name, Slug, IconName, CreatedAt, UpdatedAt
             FROM RecipeCategories
             WHERE Id = ?`,
            [id]
        );

        const row = firstOrNull(rows as CategoryRow[]);
        return row ? mapCategory(row) : null;
    }
}
