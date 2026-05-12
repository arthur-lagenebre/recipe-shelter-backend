import type { RowDataPacket } from 'mysql2';

export type Ingredient = {
    id: number;
    name: string;
    slug: string;
};

export type IngredientRow = RowDataPacket & {
    Id: number;
    Name: string;
    Slug: string;
};
