import type { Recipe, RecipeIngredient, RecipeIngredientRow, RecipePending, RecipePendingRow, RecipeRow, RecipeStep, RecipeStepRow, RecipeUtensil, RecipeUtensilRow } from './recipe.types.js';

function toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
}

function toNullableDate(value: Date | string | null): Date | null {
    return value === null ? null : toDate(value);
}

export function mapRecipe(row: RecipeRow): Recipe {
    return {
        id: row.Id,
        userId: row.UserId,
        categoryId: row.CategoryId,
        title: row.Title,
        slug: row.Slug,
        description: row.Description,
        prepTimeMinutes: row.PrepTimeMinutes,
        restTimeMinutes: row.RestTimeMinutes,
        cookTimeMinutes: row.CookTimeMinutes,
        servings: row.Servings,
        status: row.Status,
        createdAt: toDate(row.CreatedAt),
        submittedAt: toNullableDate(row.SubmittedAt),
        moderatedAt: toNullableDate(row.ModeratedAt),
        moderatedByUserId: row.ModeratedByUserId,
        publishedAt: toNullableDate(row.PublishedAt),
        archivedAt: toNullableDate(row.ArchivedAt),
        rejectionReason: row.RejectionReason,
        updatedAt: toDate(row.UpdatedAt),
        ingredients: [],
        steps: [],
        utensils: []
    };
}

export function mapRecipePending(row: RecipePendingRow): RecipePending {
    return {
        id: row.Id,
        user: row.User,
        category: row.Category,
        title: row.Title,
        slug: row.Slug,
        description: row.Description,
        submittedAt: toNullableDate(row.SubmittedAt)
    };
}

export function mapRecipeIngredient(row: RecipeIngredientRow): RecipeIngredient {
    return {
        ingredientId: row.IngredientId,
        quantity: Number(row.Quantity),
        unit: row.Unit,
        note: row.Note,
        sortOrder: row.SortOrder
    };
}

export function mapRecipeStep(row: RecipeStepRow): RecipeStep {
    return {
        stepNumber: row.StepNumber,
        description: row.Description
    };
}

export function mapRecipeUtensil(row: RecipeUtensilRow): RecipeUtensil {
    return {
        utensilId: row.UtensilId
    };
}
