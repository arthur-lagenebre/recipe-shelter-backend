import type { Ingredient, IngredientRow } from "./ingredient.types.js";

export function mapIngredient(row: IngredientRow): Ingredient {
    return {
        id: row.Id,
        name: row.Name,
        slug: row.Slug
    };
}
