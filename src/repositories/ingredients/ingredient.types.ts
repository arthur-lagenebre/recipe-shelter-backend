import type { RowDataPacket } from 'mysql2';

export type Ingredient = {
    id: number;
    name: string;
    normalizedName: string;
    slug: string;
    status: IngredientStatus;
    mergedIntoIngredientId: number | null;
    createdAt: Date;
    updatedAt: Date;
};

export type IngredientStatus = 'active' | 'deprecated' | 'merged';

export type IngredientRow = RowDataPacket & {
    Id: number;
    Name: string;
    NormalizedName: string;
    Slug: string;
    Status: IngredientStatus;
    MergedIntoIngredientId: number | null;
    CreatedAt: Date;
    UpdatedAt: Date;
};

export type IngredientAlias = {
    id: number;
    ingredientId: number;
    name: string;
    normalizedName: string;
    languageCode: string;
    createdAt: Date;
    updatedAt: Date;
};

export type IngredientAliasRow = RowDataPacket & {
    Id: number;
    IngredientId: number;
    Name: string;
    NormalizedName: string;
    LanguageCode: string;
    CreatedAt: Date;
    UpdatedAt: Date;
};
