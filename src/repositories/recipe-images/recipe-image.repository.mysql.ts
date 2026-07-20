import { mapRecipeImage } from './recipe-image.mapper.js';
import { firstOrNull } from '../../utils/array.js';

import type { RecipeImageRepository } from './recipe-image.repository.interface.js';
import type { RecipeImage, RecipeImageRow, SaveRecipeImageInput } from './recipe-image.types.js';
import type { Pool, PoolConnection } from 'mysql2/promise';

const RECIPE_IMAGE_COLUMNS = `Id, RecipeId, LargeStorageKey, MediumStorageKey, ThumbnailStorageKey,
    OriginalWidth, OriginalHeight, LargeWidth, LargeHeight, LargeSizeBytes, AltText, CreatedAt, UpdatedAt`;

export class RecipeImageRepositoryMysql implements RecipeImageRepository {
    constructor(private readonly db: Pool) {}

    async findByRecipeId(recipeId: number): Promise<RecipeImage | null> {
        const [rows] = await this.db.execute(
            `SELECT ${RECIPE_IMAGE_COLUMNS}
             FROM RecipeImages
             WHERE RecipeId = ?`,
            [recipeId]
        );

        return mapFirst(rows);
    }

    async replace(input: SaveRecipeImageInput): Promise<RecipeImage | null> {
        return this.inTransaction(async (connection) => {
            const previous = await this.findByRecipeIdForUpdate(input.recipeId, connection);

            await connection.execute(
                `INSERT INTO RecipeImages (Id, RecipeId, LargeStorageKey, MediumStorageKey, ThumbnailStorageKey,
                    OriginalWidth, OriginalHeight, LargeWidth, LargeHeight, LargeSizeBytes, AltText)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 AS new_image
                 ON DUPLICATE KEY UPDATE
                    Id = new_image.Id,
                    LargeStorageKey = new_image.LargeStorageKey,
                    MediumStorageKey = new_image.MediumStorageKey,
                    ThumbnailStorageKey = new_image.ThumbnailStorageKey,
                    OriginalWidth = new_image.OriginalWidth,
                    OriginalHeight = new_image.OriginalHeight,
                    LargeWidth = new_image.LargeWidth,
                    LargeHeight = new_image.LargeHeight,
                    LargeSizeBytes = new_image.LargeSizeBytes,
                    AltText = new_image.AltText,
                    CreatedAt = CURRENT_TIMESTAMP,
                    UpdatedAt = CURRENT_TIMESTAMP`,
                [
                    input.id,
                    input.recipeId,
                    input.largeStorageKey,
                    input.mediumStorageKey,
                    input.thumbnailStorageKey,
                    input.originalWidth,
                    input.originalHeight,
                    input.largeWidth,
                    input.largeHeight,
                    input.largeSizeBytes,
                    input.altText
                ]
            );

            return previous;
        });
    }

    async deleteByRecipeId(recipeId: number): Promise<RecipeImage | null> {
        return this.inTransaction(async (connection) => {
            const previous = await this.findByRecipeIdForUpdate(recipeId, connection);

            if (previous) {
                await connection.execute(
                    `DELETE FROM RecipeImages
                     WHERE RecipeId = ?`,
                    [recipeId]
                );
            }

            return previous;
        });
    }

    private async findByRecipeIdForUpdate(recipeId: number, connection: PoolConnection): Promise<RecipeImage | null> {
        const [rows] = await connection.execute(
            `SELECT ${RECIPE_IMAGE_COLUMNS}
             FROM RecipeImages
             WHERE RecipeId = ?
             FOR UPDATE`,
            [recipeId]
        );

        return mapFirst(rows);
    }

    private async inTransaction<T>(operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
        const connection = await this.db.getConnection();

        try {
            await connection.beginTransaction();
            const result = await operation(connection);
            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

function mapFirst(rows: unknown): RecipeImage | null {
    const row = firstOrNull(rows as RecipeImageRow[]);

    return row ? mapRecipeImage(row) : null;
}
