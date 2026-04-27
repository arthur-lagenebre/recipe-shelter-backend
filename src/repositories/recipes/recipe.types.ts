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
    prepTimeMinutes?: number;
    restTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    servings?: number;
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
    ingredients: RecipeIngredient[];
    steps: RecipeStep[];
    utensils: RecipeUtensil[];
};

export type RecipePending = {
    id: number;
    user: string;
    category: string | null;
    title: string;
    slug: string;
    description: string;
    submittedAt: Date | null;
}

export type RecipeRow = RowDataPacket & {
    Id: number;
    UserId: number;
    CategoryId: number | null;
    Title: string;
    Slug: string;
    Description: string;
    PrepTimeMinutes: number;
    RestTimeMinutes: number | null;
    CookTimeMinutes: number | null;
    Servings: number;
    Status: string;
    CreatedAt: Date | string;
    SubmittedAt: Date | string | null;
    ModeratedAt: Date | string | null;
    ModeratedByUserId: number | null;
    PublishedAt: Date | string | null;
    ArchivedAt: Date | string | null;
    RejectionReason: string | null;
    UpdatedAt: Date | string;
};

export type RecipePendingRow = RowDataPacket & {
    Id: number;
    User: string;
    Category: string | null;
    Title: string;
    Slug: string;
    Description: string;
    SubmittedAt: Date | string | null;
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
