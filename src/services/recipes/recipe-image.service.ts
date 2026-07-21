import { randomUUID } from 'node:crypto';

import { canEditRecipe } from './recipe-permissions.js';
import { mapRecipeImageDto } from '../../repositories/recipe-images/recipe-image.mapper.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

import type { ProcessedRecipeImage, RecipeImageProcessor } from './recipe-image.processor.js';
import type { AuthContext } from '../../api/auth/auth.types.js';
import type { RecipeImageRepository } from '../../repositories/recipe-images/recipe-image.repository.interface.js';
import type { RecipeCoverImageDto, RecipeImage, SaveRecipeImageInput } from '../../repositories/recipe-images/recipe-image.types.js';
import type { RecipeRepository } from '../../repositories/recipes/recipe.repository.interface.js';
import type { ImageStorage } from '../../storage/image-storage.interface.js';

export type RecipeImageUpload = {
    buffer: Buffer;
    size: number;
};

export class RecipeImageService {
    constructor(
        private readonly recipeRepository: RecipeRepository,
        private readonly recipeImageRepository: RecipeImageRepository,
        private readonly processor: RecipeImageProcessor,
        private readonly storage: ImageStorage,
        private readonly createImageId: () => string = randomUUID
    ) {}

    async replace(
        recipeId: number,
        auth: AuthContext,
        upload: RecipeImageUpload | undefined,
        altTextInput: unknown
    ): Promise<RecipeCoverImageDto> {
        await this.requireEditableRecipe(recipeId, auth);

        if (!upload)
            throw badRequest('An image file is required', 'IMAGE_REQUIRED');

        const altText = normalizeAltText(altTextInput);
        const processed = await this.processor.process(upload.buffer);
        const input = this.createSaveInput(recipeId, processed, altText);
        const uploadedKeys: string[] = [];
        let committed = false;

        try {
            await this.putVariant(input.largeStorageKey, processed.large.buffer, uploadedKeys);
            await this.putVariant(input.mediumStorageKey, processed.medium.buffer, uploadedKeys);
            await this.putVariant(input.thumbnailStorageKey, processed.thumbnail.buffer, uploadedKeys);

            const previous = await this.recipeImageRepository.replace(input);
            committed = true;

            if (previous)
                await this.deleteObjects(this.storageKeys(previous), 'replaced recipe image');

            return mapRecipeImageDto({ ...input, createdAt: new Date(), updatedAt: new Date() }, (key) => this.storage.getPublicUrl(key));
        } catch (error) {
            if (!committed)
                await this.deleteObjects(uploadedKeys, 'failed recipe image upload');

            throw error;
        }
    }

    async delete(recipeId: number, auth: AuthContext): Promise<void> {
        await this.requireEditableRecipe(recipeId, auth);

        const deleted = await this.recipeImageRepository.deleteByRecipeId(recipeId);

        if (!deleted)
            throw notFound('Recipe image not found', 'RECIPE_IMAGE_NOT_FOUND');

        await this.deleteObjects(this.storageKeys(deleted), 'deleted recipe image');
    }

    async findForCleanup(recipeId: number): Promise<RecipeImage | null> {
        return this.recipeImageRepository.findByRecipeId(recipeId);
    }

    async cleanupAfterRecipeDeletion(image: RecipeImage): Promise<void> {
        await this.deleteObjects(this.storageKeys(image), 'deleted recipe');
    }

    private async requireEditableRecipe(recipeId: number, auth: AuthContext): Promise<void> {
        const recipe = await this.recipeRepository.findById(recipeId);

        if (!recipe)
            throw notFound('Recipe not found', 'RECIPE_NOT_FOUND');

        if (!canEditRecipe(recipe, auth))
            throw forbidden('Recipe image cannot be updated', 'RECIPE_IMAGE_UPDATE_FORBIDDEN');
    }

    private createSaveInput(recipeId: number, processed: ProcessedRecipeImage, altText: string | null): SaveRecipeImageInput {
        const id = this.createImageId();
        const prefix = `recipes/${recipeId}/${id}`;

        return {
            id,
            recipeId,
            largeStorageKey: `${prefix}/large.webp`,
            mediumStorageKey: `${prefix}/medium.webp`,
            thumbnailStorageKey: `${prefix}/thumbnail.webp`,
            originalWidth: processed.originalWidth,
            originalHeight: processed.originalHeight,
            largeWidth: processed.large.width,
            largeHeight: processed.large.height,
            largeSizeBytes: processed.large.sizeBytes,
            altText
        };
    }

    private async putVariant(key: string, body: Buffer, uploadedKeys: string[]): Promise<void> {
        await this.storage.put({ key, body, contentType: 'image/webp' });
        uploadedKeys.push(key);
    }

    private storageKeys(image: RecipeImage): string[] {
        return [image.largeStorageKey, image.mediumStorageKey, image.thumbnailStorageKey];
    }

    private async deleteObjects(keys: string[], reason: string): Promise<void> {
        const results = await Promise.allSettled(keys.map((key) => this.storage.delete(key)));

        results.forEach((result, index) => {
            if (result.status === 'rejected')
                logger.warn('[recipe-images] Orphaned storage object', { key: keys[index], reason, error: result.reason });
        });
    }
}

export function normalizeAltText(value: unknown): string | null {
    if (value === undefined || value === null)
        return null;

    if (typeof value !== 'string')
        throw badRequest('Alt text must be a string', 'IMAGE_ALT_TEXT_INVALID');

    const altText = value.trim();

    if (!altText)
        return null;

    if (altText.length > 255)
        throw badRequest('Alt text must not exceed 255 characters', 'IMAGE_ALT_TEXT_TOO_LONG');

    if (/<[^>]*>/.test(altText))
        throw badRequest('Alt text must not contain HTML', 'IMAGE_ALT_TEXT_INVALID');

    return altText;
}
