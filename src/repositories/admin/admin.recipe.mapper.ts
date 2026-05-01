import type { AdminRecipeIngredient, RecipeIngredientRow, RecipePending, RecipePendingRow, AdminRecipeStep, RecipeStepRow, AdminRecipeUtensil, RecipeUtensilRow } from "./admin.recipe.types.js";

export function mapRecipePending(row: RecipePendingRow): RecipePending {
    return {
        id: row.Id,
        user: row.User,
        category: row.Category,
        title: row.Title,
        slug: row.Slug,
        description: row.Description,
        submittedAt: row.SubmittedAt
    };
}

export function mapRecipeIngredient(row: RecipeIngredientRow): AdminRecipeIngredient {
    return {
        id: row.Id,
        name: row.Name,
        quantity: Number(row.Quantity),
        unit: row.Unit,
        note: row.Note,
        sortOrder: row.SortOrder
    };
}

export function mapRecipeStep(row: RecipeStepRow): AdminRecipeStep {
    return {
        stepNumber: row.StepNumber,
        description: row.Description
    };
}

export function mapRecipeUtensil(row: RecipeUtensilRow): AdminRecipeUtensil {
    return {
        id: row.Id,
        name: row.Name
    };
}