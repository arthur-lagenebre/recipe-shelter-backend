import type { AdminRecipeIngredient, RecipeIngredientRow, RecipePending, RecipePendingRow, AdminRecipeStep, RecipeStepRow, AdminRecipeEquipment, RecipeEquipmentRow, RecipeTagRow, AdminRecipeTag } from "./admin.recipe.types.js";

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
        displayText: row.DisplayText,
        quantity: row.Quantity === null ? null : Number(row.Quantity),
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

export function mapRecipeEquipment(row: RecipeEquipmentRow): AdminRecipeEquipment {
    return {
        id: row.Id,
        name: row.Name
    };
}

export function mapRecipeTag(row: RecipeTagRow): AdminRecipeTag {
    return {
        id: row.Id,
        name: row.Name
    };
}
