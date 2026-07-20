import type { Comment, CommentRow, PublicComment, PublicCommentRow } from './comment.types.js';

const DELETED_COMMENT_TEXT = 'Commentaire supprimé par son auteur.';
const MODERATED_COMMENT_TEXT = 'Ce commentaire a été masqué par la modération.';

export function mapComment(row: CommentRow): Comment {
    return {
        id: row.Id,
        recipeId: row.RecipeId,
        userId: row.UserId,
        parentCommentId: row.ParentCommentId,
        moderatedAt: row.ModeratedAt,
        moderatedByUserId: row.ModeratedByUserId,
        deletedAt: row.DeletedAt,
        deletedByUserId: row.DeletedByUserId,
        rating: row.Rating,
        comment: row.Comment,
        createdAt: row.CreatedAt,
        updatedAt: row.UpdatedAt
    };
}

export function mapPublicComment(row: PublicCommentRow): PublicComment {
    return {
        id: row.Id,
        recipeId: row.RecipeId,
        author: {
            id: row.AuthorId,
            username: row.AuthorUsername
        },
        parentCommentId: row.ParentCommentId,
        moderatedAt: row.ModeratedAt,
        deletedAt: row.DeletedAt,
        rating: row.Rating,
        comment: mapPublicCommentText(row),
        createdAt: row.CreatedAt,
        updatedAt: row.UpdatedAt,
        children: []
    };
}

export function mapPublicComments(rows: PublicCommentRow[]): PublicComment[] {
    const commentsById = new Map<number, PublicComment>();
    const rootComments: PublicComment[] = [];

    for (const row of rows) commentsById.set(row.Id, mapPublicComment(row));

    for (const comment of commentsById.values()) {
        if (comment.parentCommentId === null || comment.parentCommentId === undefined) {
            rootComments.push(comment);
            continue;
        }

        const parent = commentsById.get(comment.parentCommentId);
        if (parent?.children) parent.children.push(comment);
    }

    return rootComments;
}

function mapPublicCommentText(row: Pick<CommentRow, 'Comment' | 'DeletedAt' | 'ModeratedAt'>): string {
    if (row.DeletedAt !== null) return DELETED_COMMENT_TEXT;

    if (row.ModeratedAt !== null) return MODERATED_COMMENT_TEXT;

    return row.Comment;
}
