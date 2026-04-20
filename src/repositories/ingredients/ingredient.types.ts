import type { RowDataPacket } from 'mysql2';

export type Ingredient = {
    id: number;
    name: string;
    slug: string;
    categoryId: number;
    category: string | null;
};

export type IngredientRow = RowDataPacket & {
    id: number;
    name: string;
    slug: string;
    categoryId: number;
    category: string | null;
};
