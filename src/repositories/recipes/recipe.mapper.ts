import type { RatedRecipeListItem, RatedRecipeListItemRow, Recipe, RecipeDetail, RecipeDetailComment, RecipeDetailCommentRow, RecipeDetailEquipment, RecipeDetailIngredient, RecipeDetailIngredientRow, RecipeDetailStep, RecipeDetailStepRow, RecipeDetailTag, RecipeDetailTagRow, RecipeDetailEquipmentRow, RecipeIngredient, RecipeIngredientRow, RecipeListItem, RecipeListItemRow, RecipeRow, RecipeStep, RecipeStepRow, RecipeSummary, RecipeEquipment, RecipeEquipmentRow } from './recipe.types.js';

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
        equipments: []
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

export function mapRecipeEquipment(row: RecipeEquipmentRow): RecipeEquipment {
    return {
        equipmentId: row.EquipmentId
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

export function mapRatedRecipeListItem(row: RatedRecipeListItemRow): RatedRecipeListItem {
    return {
        ...mapRecipeListItem(row),
        averageRating: Number(row.AverageRating),
        ratingsCount: Number(row.RatingsCount)
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
        tags: [],
        comments: [],
        commentsCount: 0,
        averageRating: null,
        ratingsCount: 0
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

export function mapRecipeDetailEquipment(row: RecipeDetailEquipmentRow): RecipeDetailEquipment {
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

export function mapRecipeDetailComment(row: RecipeDetailCommentRow): RecipeDetailComment {
    return {
        id: row.Id,
        isModerated: row.ModeratedAt !== null,
        isDeleted: row.DeletedAt !== null,
        username: row.Username,
        parentCommentId: row.ParentCommentId,
        moderatedAt: row.ModeratedAt,
        moderatedByUsername: row.ModeratedByUsername,
        rating: row.Rating,
        comment: mapRecipeDetailCommentText(row),
        createdAt: row.CreatedAt,
        updatedAt: row.UpdatedAt,
        children: []
    };
}

export function mapRecipeDetailComments(rows: RecipeDetailCommentRow[]): RecipeDetailComment[] {
    const commentsById = new Map<number, RecipeDetailComment>();
    const rootComments: RecipeDetailComment[] = [];

    for (const row of rows)
        commentsById.set(row.Id, mapRecipeDetailComment(row));

    for (const comment of commentsById.values()) {
        if (comment.parentCommentId === null) {
            rootComments.push(comment);
            continue;
        }

        const parent = commentsById.get(comment.parentCommentId);
        if (parent)
            parent.children.push(comment);
    }

    return rootComments;
}

function mapRecipeDetailCommentText(row: RecipeDetailCommentRow): string {
    if (row.DeletedAt !== null)
        return 'Commentaire supprimé par son auteur.';

    if (row.ModeratedAt !== null)
        return 'Ce commentaire a été masqué par la modération.';

    return row.Comment;
}
