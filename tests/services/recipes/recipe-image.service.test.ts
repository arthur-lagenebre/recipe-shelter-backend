import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { RecipeImageService, normalizeAltText } from '../../../src/services/recipes/recipe-image.service.js';
import { HttpError } from '../../../src/utils/errors.js';
import { logger } from '../../../src/utils/logger.js';

import type { AuthContext } from '../../../src/api/auth/auth.types.js';
import type { RecipeImageRepository } from '../../../src/repositories/recipe-images/recipe-image.repository.interface.js';
import type { RecipeImage, SaveRecipeImageInput } from '../../../src/repositories/recipe-images/recipe-image.types.js';
import type { RecipeRepository } from '../../../src/repositories/recipes/recipe.repository.interface.js';
import type { Recipe } from '../../../src/repositories/recipes/recipe.types.js';
import type { ImageStorage, PutImageInput } from '../../../src/storage/image-storage.interface.js';

const owner: AuthContext = { userId: 2, username: 'owner', roleId: 2, status: 'active' };
const otherUser: AuthContext = { userId: 3, username: 'other', roleId: 2, status: 'active' };
const admin: AuthContext = { userId: 1, username: 'admin', roleId: 1, status: 'active' };

const baseRecipe: Recipe = {
    id: 10,
    userId: 2,
    categoryId: 1,
    title: 'Cake',
    slug: 'cake-draft',
    description: 'Good',
    coverImage: null,
    prepTimeMinutes: 15,
    restTimeMinutes: null,
    cookTimeMinutes: 45,
    servings: 6,
    status: 'draft',
    createdAt: new Date('2026-05-09T10:00:00.000Z'),
    submittedAt: null,
    moderatedAt: null,
    moderatedByUserId: null,
    publishedAt: null,
    archivedAt: null,
    rejectionReason: null,
    updatedAt: new Date('2026-05-10T10:00:00.000Z'),
    tagIds: [],
    ingredients: [],
    steps: [],
    equipments: []
};

const processed = {
    originalWidth: 2000,
    originalHeight: 1000,
    large: { buffer: Buffer.from('large'), width: 1600, height: 800, sizeBytes: 5, contentType: 'image/webp' as const },
    medium: { buffer: Buffer.from('medium'), width: 800, height: 400, sizeBytes: 6, contentType: 'image/webp' as const },
    thumbnail: { buffer: Buffer.from('thumb'), width: 400, height: 200, sizeBytes: 5, contentType: 'image/webp' as const }
};

class FakeRecipeRepository {
    recipe: Recipe | null = baseRecipe;

    async findById(): Promise<Recipe | null> {
        return this.recipe;
    }
}

class FakeRecipeImageRepository implements RecipeImageRepository {
    image: RecipeImage | null = null;
    failReplace = false;
    events: string[] = [];

    async findByRecipeId(): Promise<RecipeImage | null> {
        return this.image;
    }

    async replace(input: SaveRecipeImageInput): Promise<RecipeImage | null> {
        this.events.push('db:replace');
        if (this.failReplace)
            throw new Error('SQL failed');

        const previous = this.image;
        this.image = toRecipeImage(input);
        return previous;
    }

    async deleteByRecipeId(): Promise<RecipeImage | null> {
        this.events.push('db:delete');
        const previous = this.image;
        this.image = null;
        return previous;
    }
}

class FakeStorage implements ImageStorage {
    objects = new Map<string, Buffer>();
    deletedKeys: string[] = [];
    events: string[] = [];
    failDeletes = false;
    failPutKey: string | null = null;

    async put(input: PutImageInput): Promise<void> {
        this.events.push(`put:${input.key}`);
        if (input.key === this.failPutKey)
            throw new Error('Storage put failed');
        this.objects.set(input.key, input.body);
        assert.equal(input.contentType, 'image/webp');
    }

    async delete(key: string): Promise<void> {
        this.events.push(`delete:${key}`);
        this.deletedKeys.push(key);
        this.objects.delete(key);
        if (this.failDeletes)
            throw new Error('Storage delete failed');
    }

    getPublicUrl(key: string): string {
        return `https://images.example.test/${key}`;
    }
}

function toRecipeImage(input: SaveRecipeImageInput): RecipeImage {
    return { ...input, createdAt: new Date('2026-07-13T10:00:00.000Z'), updatedAt: new Date('2026-07-13T10:00:00.000Z') };
}

function oldImage(): RecipeImage {
    return toRecipeImage({
        id: 'old-id',
        recipeId: 10,
        largeStorageKey: 'recipes/10/old-id/large.webp',
        mediumStorageKey: 'recipes/10/old-id/medium.webp',
        thumbnailStorageKey: 'recipes/10/old-id/thumbnail.webp',
        originalWidth: 1200,
        originalHeight: 600,
        largeWidth: 1200,
        largeHeight: 600,
        largeSizeBytes: 100,
        altText: 'Old image'
    });
}

function assertHttpError(error: unknown, code: string, status: number): boolean {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
    return true;
}

describe('RecipeImageService', () => {
    let recipes: FakeRecipeRepository;
    let images: FakeRecipeImageRepository;
    let storage: FakeStorage;
    let service: RecipeImageService;

    beforeEach(() => {
        recipes = new FakeRecipeRepository();
        images = new FakeRecipeImageRepository();
        storage = new FakeStorage();
        const processor = { process: async () => processed };
        service = new RecipeImageService(recipes as unknown as RecipeRepository, images, processor as never, storage, () => 'new-id');
    });

    it('enforces missing recipe, ownership, editable statuses and existing admin rules', async () => {
        recipes.recipe = null;
        await assert.rejects(() => service.replace(10, owner, upload(), null), (error) => assertHttpError(error, 'RECIPE_NOT_FOUND', 404));

        recipes.recipe = baseRecipe;
        await assert.rejects(() => service.replace(10, otherUser, upload(), null), (error) => assertHttpError(error, 'RECIPE_IMAGE_UPDATE_FORBIDDEN', 403));
        await assert.rejects(() => service.replace(10, admin, upload(), null), (error) => assertHttpError(error, 'RECIPE_IMAGE_UPDATE_FORBIDDEN', 403));

        recipes.recipe = { ...baseRecipe, status: 'published' };
        await assert.rejects(() => service.replace(10, owner, upload(), null), (error) => assertHttpError(error, 'RECIPE_IMAGE_UPDATE_FORBIDDEN', 403));

        recipes.recipe = baseRecipe;
        await assert.rejects(() => service.replace(10, owner, undefined, null), (error) => assertHttpError(error, 'IMAGE_REQUIRED', 400));
    });

    it('stores a first image with server-generated keys and returns only public URLs', async () => {
        const result = await service.replace(10, owner, upload(), '  Cake maison  ');

        assert.equal(images.image?.id, 'new-id');
        assert.deepEqual([...storage.objects.keys()], [
            'recipes/10/new-id/large.webp',
            'recipes/10/new-id/medium.webp',
            'recipes/10/new-id/thumbnail.webp'
        ]);
        assert.deepEqual(result, {
            id: 'new-id',
            largeUrl: 'https://images.example.test/recipes/10/new-id/large.webp',
            mediumUrl: 'https://images.example.test/recipes/10/new-id/medium.webp',
            thumbnailUrl: 'https://images.example.test/recipes/10/new-id/thumbnail.webp',
            width: 1600,
            height: 800,
            altText: 'Cake maison'
        });
        assert.equal(JSON.stringify(result).includes('StorageKey'), false);
    });

    it('replaces with new keys and deletes old objects only after the database commit', async () => {
        images.image = oldImage();

        await service.replace(10, owner, upload(), null);

        assert.equal(images.image?.id, 'new-id');
        assert.deepEqual(storage.deletedKeys, [
            'recipes/10/old-id/large.webp',
            'recipes/10/old-id/medium.webp',
            'recipes/10/old-id/thumbnail.webp'
        ]);
        assert.equal(images.events[0], 'db:replace');
        assert.ok(storage.events.findIndex((event) => event.startsWith('delete:recipes/10/old-id')) > storage.events.findIndex((event) => event.startsWith('put:recipes/10/new-id')));
    });

    it('cleans all new objects and preserves the old image when SQL replacement fails', async () => {
        const previous = oldImage();
        images.image = previous;
        images.failReplace = true;

        await assert.rejects(() => service.replace(10, owner, upload(), null), /SQL failed/);

        assert.equal(images.image, previous);
        assert.deepEqual(storage.deletedKeys, [
            'recipes/10/new-id/large.webp',
            'recipes/10/new-id/medium.webp',
            'recipes/10/new-id/thumbnail.webp'
        ]);
        assert.equal(storage.objects.size, 0);
    });

    it('compensates variants already uploaded when a later storage write fails', async () => {
        storage.failPutKey = 'recipes/10/new-id/medium.webp';

        await assert.rejects(() => service.replace(10, owner, upload(), null), /Storage put failed/);

        assert.deepEqual(storage.deletedKeys, ['recipes/10/new-id/large.webp']);
        assert.equal(storage.objects.size, 0);
        assert.deepEqual(images.events, []);
    });

    it('deletes the database reference before physical objects and reports missing images', async () => {
        images.image = oldImage();

        await service.delete(10, owner);

        assert.equal(images.image, null);
        assert.equal(images.events[0], 'db:delete');
        assert.equal(storage.deletedKeys.length, 3);

        await assert.rejects(() => service.delete(10, owner), (error) => assertHttpError(error, 'RECIPE_IMAGE_NOT_FOUND', 404));
    });

    it('keeps a committed replacement or deletion successful when physical cleanup fails', async () => {
        images.image = oldImage();
        storage.failDeletes = true;
        const originalWarn = logger.warn;
        logger.warn = () => { };

        try {
            const replacement = await service.replace(10, owner, upload(), null);
            assert.equal(replacement.id, 'new-id');
            assert.equal(images.image?.id, 'new-id');

            await service.delete(10, owner);
            assert.equal(images.image, null);
        } finally {
            logger.warn = originalWarn;
        }
    });

    it('normalizes optional alt text and rejects excessive or HTML values', () => {
        assert.equal(normalizeAltText('   '), null);
        assert.equal(normalizeAltText('  Description  '), 'Description');
        assert.throws(() => normalizeAltText('x'.repeat(256)), (error) => assertHttpError(error, 'IMAGE_ALT_TEXT_TOO_LONG', 400));
        assert.throws(() => normalizeAltText('<b>Cake</b>'), (error) => assertHttpError(error, 'IMAGE_ALT_TEXT_INVALID', 400));
    });
});

function upload() {
    return { buffer: Buffer.from('source'), size: 6 };
}
