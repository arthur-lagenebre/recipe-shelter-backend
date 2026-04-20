import { type Ingredient, type IngredientRow } from "./ingredient.types.js";

export function mapIngredient(row: IngredientRow): Ingredient {
    return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        categoryId: row.categoryId,
        category: row.category
    };
}
