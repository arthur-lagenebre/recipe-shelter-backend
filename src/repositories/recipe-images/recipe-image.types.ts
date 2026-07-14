import type { RowDataPacket } from 'mysql2';

export type RecipeCoverImageDto = {
    id: string;
    largeUrl: string;
    mediumUrl: string;
    thumbnailUrl: string;
    width: number;
    height: number;
    altText: string | null;
};

export type RecipeImage = {
    id: string;
    recipeId: number;
    largeStorageKey: string;
    mediumStorageKey: string;
    thumbnailStorageKey: string;
    originalWidth: number;
    originalHeight: number;
    largeWidth: number;
    largeHeight: number;
    largeSizeBytes: number;
    altText: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type SaveRecipeImageInput = Omit<RecipeImage, 'createdAt' | 'updatedAt'>;

export type RecipeImageRow = RowDataPacket & {
    Id: string;
    RecipeId: number;
    LargeStorageKey: string;
    MediumStorageKey: string;
    ThumbnailStorageKey: string;
    OriginalWidth: number;
    OriginalHeight: number;
    LargeWidth: number;
    LargeHeight: number;
    LargeSizeBytes: number;
    AltText: string | null;
    CreatedAt: Date;
    UpdatedAt: Date;
};

export type RecipeImageJoinedRow = {
    CoverImageId: string | null;
    CoverImageLargeStorageKey: string | null;
    CoverImageMediumStorageKey: string | null;
    CoverImageThumbnailStorageKey: string | null;
    CoverImageWidth: number | null;
    CoverImageHeight: number | null;
    CoverImageAltText: string | null;
};

export type PublicImageUrlBuilder = (storageKey: string) => string;
