import type { Recipe, RecipeIngredient, RecipeIngredientRow, RecipeRow, RecipeStep, RecipeStepRow, RecipeUtensil, RecipeUtensilRow } from './recipe.types.js';

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
        createdAt: row.CreatedAt,
        submittedAt: row.SubmittedAt,
        moderatedAt: row.ModeratedAt,
        moderatedByUserId: row.ModeratedByUserId,
        publishedAt: row.PublishedAt,
        archivedAt: row.ArchivedAt,
        rejectionReason: row.RejectionReason,
        updatedAt: row.UpdatedAt,
        ingredients: [],
        steps: [],
        utensils: []
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
