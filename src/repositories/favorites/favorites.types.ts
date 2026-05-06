import type { RowDataPacket } from 'mysql2';

export type Favorite = {
    userId: number;
    recipeId: number;
    createdAt: Date;
};

export type FavoriteRow = RowDataPacket & {
    UserId: number;
    RecipeId: number;
    CreatedAt: Date;
};