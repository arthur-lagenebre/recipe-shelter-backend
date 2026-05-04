import type { RowDataPacket } from 'mysql2';

export type RecipeIngredientInput = {
    ingredientId: number;
    quantity: number;
    unit?: string | null;
    note?: string | null;
    sortOrder?: number;
};

export type RecipeStepInput = {
    stepNumber?: number;
    description: string;
};

export type RecipeUtensilInput = {
    utensilId: number;
};

export type RecipeInput = {
    userId: number;
    categoryId?: number | null;
    title: string;
    slug: string;
    description?: string;
    coverImageUrl?: string | null;
    prepTimeMinutes?: number;
    restTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    servings?: number;
    tagIds?: number[];
    ingredients?: RecipeIngredientInput[];
    steps?: RecipeStepInput[];
    utensils?: RecipeUtensilInput[];
};

export type UpdateRecipeInput = RecipeInput & {
    id: number;
};

export type RecipeIngredient = {
    ingredientId: number;
    quantity: number;
    unit: string | null;
    note: string | null;
    sortOrder: number;
};

export type RecipeStep = {
    stepNumber: number;
    description: string;
};

export type RecipeUtensil = {
    utensilId: number;
};

export type Recipe = {
    id: number;
    userId: number;
    categoryId: number | null;
    title: string;
    slug: string;
    description: string;
    coverImageUrl: string | null;
    prepTimeMinutes: number;
    restTimeMinutes: number | null;
    cookTimeMinutes: number | null;
    servings: number;
    status: string;
    createdAt: Date;
    submittedAt: Date | null;
    moderatedAt: Date | null;
    moderatedByUserId: number | null;
    publishedAt: Date | null;
    archivedAt: Date | null;
    rejectionReason: string | null;
    updatedAt: Date;
    tagIds: number[];
    ingredients: RecipeIngredient[];
    steps: RecipeStep[];
    utensils: RecipeUtensil[];
};

export type RecipeRow = RowDataPacket & {
    Id: number;
    UserId: number;
    CategoryId: number | null;
    Title: string;
    Slug: string;
    Description: string;
    RecipeCoverImage: string | null;
    PrepTimeMinutes: number;
    RestTimeMinutes: number | null;
    CookTimeMinutes: number | null;
    Servings: number;
    Status: string;
    CreatedAt: Date;
    SubmittedAt: Date | null;
    ModeratedAt: Date | null;
    ModeratedByUserId: number | null;
    PublishedAt: Date | null;
    ArchivedAt: Date | null;
    RejectionReason: string | null;
    UpdatedAt: Date;
};

export type RecipeIngredientRow = RowDataPacket & {
    IngredientId: number;
    Quantity: number | string;
    Unit: string | null;
    Note: string | null;
    SortOrder: number;
};

export type RecipeStepRow = RowDataPacket & {
    StepNumber: number;
    Description: string;
};

export type RecipeUtensilRow = RowDataPacket & {
    UtensilId: number;
};

export type RecipeTagRow = RowDataPacket & {
    TagId: number;
};
