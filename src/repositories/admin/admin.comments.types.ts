import type { RowDataPacket } from 'mysql2';

export type AdminComment = {
    id: number;
    recipeId: number;
    recipeTitle: string;
    recipeSlug: string;
    userId: number;
    username: string;
    parentCommentId: number | null;
    moderatedAt: Date | null;
    moderatedByUserId: number | null;
    moderatedByUsername: string | null;
    deletedAt: Date | null;
    deletedByUserId: number | null;
    deletedByUsername: string | null;
    rating: number | null;
    comment: string;
    createdAt: Date;
    updatedAt: Date;
};

export type AdminUpdateCommentInput = {
    id: number;
    rating?: number | null;
    comment: string;
};

export type AdminCommentRow = RowDataPacket & {
    Id: number;
    RecipeId: number;
    RecipeTitle: string;
    RecipeSlug: string;
    UserId: number;
    Username: string;
    ParentCommentId: number | null;
    ModeratedAt: Date | null;
    ModeratedByUserId: number | null;
    ModeratedByUsername: string | null;
    DeletedAt: Date | null;
    DeletedByUserId: number | null;
    DeletedByUsername: string | null;
    Rating: number | null;
    Comment: string;
    CreatedAt: Date;
    UpdatedAt: Date;
};
