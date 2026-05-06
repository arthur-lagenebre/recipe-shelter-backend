import type { Recipe, RecipeDetail, RecipeDetailEquipment, RecipeDetailIngredient, RecipeDetailIngredientRow, RecipeDetailStep, RecipeDetailStepRow, RecipeDetailTag, RecipeDetailTagRow, RecipeDetailUtensilRow, RecipeIngredient, RecipeIngredientRow, RecipeListItem, RecipeListItemRow, RecipeRow, RecipeStep, RecipeStepRow, RecipeSummary, RecipeUtensil, RecipeUtensilRow } from './recipe.types.js';

export function mapRecipe(row: RecipeRow): Recipe {
    return {
        id: row.Id,
        userId: row.UserId,
        categoryId: row.CategoryId,
        title: row.Title,
        slug: row.Slug,
        description: row.Description,
        coverImageUrl: row.RecipeCoverImage,
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
        tagIds: [],
        ingredients: [],
        steps: [],
        utensils: []
    };
}

export function mapRecipeSummary(row: RecipeRow): RecipeSummary {
    return {
        id: row.Id,
        title: row.Title,
        slug: row.Slug,
        description: row.Description,
        status: row.Status,
        createdAt: row.CreatedAt,
        submittedAt: row.SubmittedAt,
        publishedAt: row.PublishedAt,
        rejectionReason: row.RejectionReason,
        updatedAt: row.UpdatedAt
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

export function mapRecipeListItem(row: RecipeListItemRow): RecipeListItem {
    return {
        id: row.Id,
        title: row.Title,
        slug: row.Slug,
        description: row.Description,
        category: row.Category,
        coverImageUrl: row.RecipeCoverImage,
        prepTimeMinutes: row.PrepTimeMinutes,
        cookTimeMinutes: row.CookTimeMinutes,
        restTimeMinutes: row.RestTimeMinutes,
        servings: row.Servings,
        authorUsername: row.AuthorUsername,
        publishedAt: row.PublishedAt,
        isFavorite: Boolean(row.IsFavorite)
    };
}

export function mapRecipeDetail(row: RecipeListItemRow): RecipeDetail {
    return {
        id: row.Id,
        title: row.Title,
        slug: row.Slug,
        description: row.Description,
        category: row.Category,
        coverImageUrl: row.RecipeCoverImage,
        prepTimeMinutes: row.PrepTimeMinutes,
        cookTimeMinutes: row.CookTimeMinutes,
        restTimeMinutes: row.RestTimeMinutes,
        servings: row.Servings,
        authorUsername: row.AuthorUsername,
        publishedAt: row.PublishedAt,
        isFavorite: Boolean(row.IsFavorite),
        ingredients: [],
        steps: [],
        equipments: [],
        tags: []
    };
}

export function mapRecipeDetailIngredient(row: RecipeDetailIngredientRow): RecipeDetailIngredient {
    return {
        id: row.IngredientId,
        name: row.Name,
        slug: row.Slug,
        quantity: Number(row.Quantity),
        unit: row.Unit,
        note: row.Note,
        sortOrder: row.SortOrder
    };
}

export function mapRecipeDetailStep(row: RecipeDetailStepRow): RecipeDetailStep {
    return {
        stepNumber: row.StepNumber,
        description: row.Description
    };
}

export function mapRecipeDetailUtensil(row: RecipeDetailUtensilRow): RecipeDetailEquipment {
    return {
        id: row.Id,
        name: row.Name,
        slug: row.Slug
    };
}

export function mapRecipeDetailTag(row: RecipeDetailTagRow): RecipeDetailTag {
    return {
        id: row.Id,
        name: row.Name,
        slug: row.Slug
    };
}
