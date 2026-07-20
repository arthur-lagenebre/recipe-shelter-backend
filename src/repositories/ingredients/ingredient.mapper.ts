import type { Ingredient, IngredientAlias, IngredientAliasRow, IngredientRow } from './ingredient.types.js';

export function mapIngredient(row: IngredientRow): Ingredient {
    return {
        id: row.Id,
        name: row.Name,
        normalizedName: row.NormalizedName,
        slug: row.Slug,
        status: row.Status,
        mergedIntoIngredientId: row.MergedIntoIngredientId,
        createdAt: row.CreatedAt,
        updatedAt: row.UpdatedAt
    };
}

export function mapIngredientAlias(row: IngredientAliasRow): IngredientAlias {
    return {
        id: Number(row.Id),
        ingredientId: Number(row.IngredientId),
        name: row.Name,
        normalizedName: row.NormalizedName,
        languageCode: row.LanguageCode,
        createdAt: row.CreatedAt,
        updatedAt: row.UpdatedAt
    };
}
