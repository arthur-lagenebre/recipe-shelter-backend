import type { AdminComment, AdminCommentRow } from './admin.comments.types.js';

export function mapAdminComment(row: AdminCommentRow): AdminComment {
    return {
        id: row.Id,
        recipeId: row.RecipeId,
        recipeTitle: row.RecipeTitle,
        recipeSlug: row.RecipeSlug,
        userId: row.UserId,
        username: row.Username,
        parentCommentId: row.ParentCommentId,
        moderatedAt: row.ModeratedAt,
        moderatedByUserId: row.ModeratedByUserId,
        moderatedByUsername: row.ModeratedByUsername,
        moderationReason: row.ModerationReason,
        deletedAt: row.DeletedAt,
        deletedByUserId: row.DeletedByUserId,
        deletedByUsername: row.DeletedByUsername,
        rating: row.Rating,
        comment: row.Comment,
        createdAt: row.CreatedAt,
        updatedAt: row.UpdatedAt
    };
}
