import type {
    PublicImageUrlBuilder,
    RecipeCoverImageDto,
    RecipeImage,
    RecipeImageJoinedRow,
    RecipeImageRow
} from './recipe-image.types.js';

export function mapRecipeImage(row: RecipeImageRow): RecipeImage {
    return {
        id: row.Id,
        recipeId: row.RecipeId,
        largeStorageKey: row.LargeStorageKey,
        mediumStorageKey: row.MediumStorageKey,
        thumbnailStorageKey: row.ThumbnailStorageKey,
        originalWidth: row.OriginalWidth,
        originalHeight: row.OriginalHeight,
        largeWidth: row.LargeWidth,
        largeHeight: row.LargeHeight,
        largeSizeBytes: row.LargeSizeBytes,
        altText: row.AltText,
        createdAt: row.CreatedAt,
        updatedAt: row.UpdatedAt
    };
}

export function mapJoinedRecipeCoverImage(row: RecipeImageJoinedRow, getPublicUrl: PublicImageUrlBuilder): RecipeCoverImageDto | null {
    if (!row.CoverImageId) return null;

    if (
        !row.CoverImageLargeStorageKey ||
        !row.CoverImageMediumStorageKey ||
        !row.CoverImageThumbnailStorageKey ||
        row.CoverImageWidth === null ||
        row.CoverImageHeight === null
    )
        throw new Error(`Recipe image ${row.CoverImageId} has incomplete metadata`);

    return {
        id: row.CoverImageId,
        largeUrl: getPublicUrl(row.CoverImageLargeStorageKey),
        mediumUrl: getPublicUrl(row.CoverImageMediumStorageKey),
        thumbnailUrl: getPublicUrl(row.CoverImageThumbnailStorageKey),
        width: row.CoverImageWidth,
        height: row.CoverImageHeight,
        altText: row.CoverImageAltText
    };
}

export function mapRecipeImageDto(image: RecipeImage, getPublicUrl: PublicImageUrlBuilder): RecipeCoverImageDto {
    return {
        id: image.id,
        largeUrl: getPublicUrl(image.largeStorageKey),
        mediumUrl: getPublicUrl(image.mediumStorageKey),
        thumbnailUrl: getPublicUrl(image.thumbnailStorageKey),
        width: image.largeWidth,
        height: image.largeHeight,
        altText: image.altText
    };
}
