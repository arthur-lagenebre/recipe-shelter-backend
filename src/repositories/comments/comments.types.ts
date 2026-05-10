import type { RowDataPacket } from 'mysql2';

export type Comment = {
    id: number;
    recipeId: number;
    userId: number;
    parentCommentId?: number | null; // One reply level only: replies cannot have their own replies.
    moderatedAt?: Date | null; // Set when an admin hides the text from public endpoints.
    moderatedByUserId?: number | null; // Set when an admin hides the text from public endpoints.
    deletedAt?: Date | null; // Set when the author soft deletes the comment.
    deletedByUserId?: number | null;
    rating?: number | null; // Root comments only. Replies cannot carry a rating.
    comment: string;
    createdAt: Date;
    updatedAt: Date;
    children?: Comment[];
};

export type CreateCommentInput = {
    recipeId: number;
    userId: number;
    parentCommentId?: number | null; // Must point to a root comment; nested replies are rejected.
    rating?: number | null; // Allowed only when parentCommentId is empty.
    comment: string;
};

export type UpdateCommentInput = {
    id: number;
    userId: number;
    rating?: number | null;
    comment: string;
};

export type CommentRow = RowDataPacket & {
    Id: number;
    RecipeId: number;
    UserId: number;
    ParentCommentId: number | null;
    ModeratedAt: Date | null;
    ModeratedByUserId: number | null;
    DeletedAt: Date | null;
    DeletedByUserId: number | null;
    Rating: number | null;
    Comment: string;
    CreatedAt: Date;
    UpdatedAt: Date;
};
