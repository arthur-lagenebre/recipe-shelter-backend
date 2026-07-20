import type { RecipeCoverImageDto, RecipeImageJoinedRow } from '../recipe-images/recipe-image.types.js';
import type { RowDataPacket } from 'mysql2';

export type RecipePending = {
    id: number;
    user: string;
    category: string | null;
    title: string;
    slug: string;
    description: string;
    submittedAt: Date;
}

export type RecipeAdmin = {
    id: number;
    user: string;
    category: string | null;
    title: string;
    slug: string;
    description: string;
    coverImage: RecipeCoverImageDto | null;
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
    archiveReason: string | null;
    updatedAt: Date;
    tags: AdminRecipeTag[];
    ingredients: AdminRecipeIngredient[];
    steps: AdminRecipeStep[];
    equipments: AdminRecipeEquipment[];
}

export type AdminRecipeAuditState = {
    id: number;
    userId: number;
    categoryId: number | null;
    title: string;
    slug: string;
    status: string;
    moderatedByUserId: number | null;
    rejectionReason: string | null;
    archiveReason: string | null;
};

export type AdminRecipeIngredient = {
    id: number;
    name: string;
    quantity: number | null;
    unit: string | null;
    note: string | null;
    sortOrder: number;
};

export type AdminRecipeStep = {
    stepNumber: number;
    description: string;
};

export type AdminRecipeTag = {
    id: number;
    name: string;
};

export type AdminRecipeEquipment = {
    id: number;
    name: string;
};

export type RecipeIngredientRow = RowDataPacket & {
    Id: number;
    Name: string;
    Quantity: number | string | null;
    Unit: string | null;
    Note: string | null;
    SortOrder: number;
};

export type RecipeStepRow = RowDataPacket & {
    StepNumber: number;
    Description: string;
};

export type RecipeEquipmentRow = RowDataPacket & {
    Id: number;
    Name: string;
};

export type RecipeTagRow = RowDataPacket & {
    Id: number;
    Name: string;
};

export type RecipePendingRow = RowDataPacket & {
    Id: number;
    User: string;
    Category: string | null;
    Title: string;
    Slug: string;
    Description: string;
    SubmittedAt: Date;
};

export type RecipeAdminRow = RowDataPacket & RecipeImageJoinedRow & {
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
    CreatedAt: Date;
    SubmittedAt: Date | null;
    ModeratedAt: Date | null;
    ModeratedByUserId: number | null;
    PublishedAt: Date | null;
    ArchivedAt: Date | null;
    RejectionReason: string | null;
    ArchiveReason: string | null;
    UpdatedAt: Date;
    Username: string;
    Category: string | null;
};

export type AdminRecipeAuditStateRow = RowDataPacket & {
    Id: number;
    UserId: number;
    CategoryId: number | null;
    Title: string;
    Slug: string;
    Status: string;
    ModeratedByUserId: number | null;
    RejectionReason: string | null;
    ArchiveReason: string | null;
};
