import type { Comment, CommentRow } from "./comments.types.js";

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

export function mapPublicComment(row: CommentRow): Comment {
    return {
        ...mapComment(row),
        comment: mapPublicCommentText(row),
        children: []
    };
}

export function mapPublicComments(rows: CommentRow[]): Comment[] {
    const commentsById = new Map<number, Comment>();
    const rootComments: Comment[] = [];

    for (const row of rows)
        commentsById.set(row.Id, mapPublicComment(row));

    for (const comment of commentsById.values()) {
        if (comment.parentCommentId === null || comment.parentCommentId === undefined) {
            rootComments.push(comment);
            continue;
        }

        const parent = commentsById.get(comment.parentCommentId);
        if (parent?.children)
            parent.children.push(comment);
    }

    return rootComments;
}

function mapPublicCommentText(row: CommentRow): string {
    if (row.DeletedAt !== null)
        return DELETED_COMMENT_TEXT;

    if (row.ModeratedAt !== null)
        return MODERATED_COMMENT_TEXT;

    return row.Comment;
}
