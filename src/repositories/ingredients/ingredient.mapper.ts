import type { Ingredient, IngredientRow } from "./ingredient.types.js";

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
