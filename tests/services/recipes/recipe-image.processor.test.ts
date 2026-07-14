import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import sharp from 'sharp';

import { MAX_RECIPE_IMAGE_BYTES, RecipeImageProcessor } from '../../../src/services/recipes/recipe-image.processor.js';
import { HttpError } from '../../../src/utils/errors.js';

async function image(format: 'jpeg' | 'png' | 'webp', width: number, height: number): Promise<Buffer> {
    return sharp({
        create: {
            width,
            height,
            channels: 3,
            background: { r: 190, g: 80, b: 45 }
        }
    })[format]().toBuffer();
}

function assertHttpError(error: unknown, code: string): boolean {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    return true;
}

describe('RecipeImageProcessor', () => {
    const processor = new RecipeImageProcessor();

    for (const format of ['jpeg', 'png', 'webp'] as const) {
        it(`accepts a valid ${format.toUpperCase()} image and emits three WebP variants`, async () => {
            const result = await processor.process(await image(format, 2000, 1000));

            assert.deepEqual(
                [result.large.width, result.large.height, result.medium.width, result.medium.height, result.thumbnail.width, result.thumbnail.height],
                [1600, 800, 800, 400, 400, 200]
            );

            for (const variant of [result.large, result.medium, result.thumbnail]) {
                assert.equal(variant.contentType, 'image/webp');
                assert.equal((await sharp(variant.buffer).metadata()).format, 'webp');
                assert.equal(variant.sizeBytes, variant.buffer.byteLength);
            }
        });
    }

    it('does not enlarge small images', async () => {
        const result = await processor.process(await image('png', 120, 60));

        for (const variant of [result.large, result.medium, result.thumbnail])
            assert.deepEqual([variant.width, variant.height], [120, 60]);
    });

    it('applies EXIF orientation before resizing', async () => {
        const oriented = await sharp({
            create: { width: 40, height: 20, channels: 3, background: 'red' }
        }).jpeg().withMetadata({ orientation: 6 }).toBuffer();

        const result = await processor.process(oriented);

        assert.deepEqual([result.originalWidth, result.originalHeight], [20, 40]);
        assert.deepEqual([result.large.width, result.large.height], [20, 40]);
        const outputMetadata = await sharp(result.large.buffer).metadata();
        assert.equal(outputMetadata.orientation, undefined);
        assert.equal(outputMetadata.exif, undefined);
    });

    it('rejects oversized payloads, pathological dimensions, invalid content and forbidden formats', async () => {
        await assert.rejects(
            () => processor.process(Buffer.alloc(MAX_RECIPE_IMAGE_BYTES + 1)),
            (error) => assertHttpError(error, 'IMAGE_TOO_LARGE')
        );

        const tooWide = await image('png', 10_001, 1);
        await assert.rejects(
            () => processor.process(tooWide),
            (error) => assertHttpError(error, 'IMAGE_DIMENSIONS_TOO_LARGE')
        );

        await assert.rejects(
            () => processor.process(Buffer.from('not an image')),
            (error) => assertHttpError(error, 'IMAGE_INVALID')
        );

        const forbiddenInputs = [
            Buffer.from('GIF89a forbidden'),
            Buffer.from('%PDF-1.7 forbidden'),
            Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
            Buffer.from([0x42, 0x4d, 0x00, 0x00]),
            Buffer.from([0x49, 0x49, 0x2a, 0x00])
        ];

        for (const forbiddenInput of forbiddenInputs) {
            await assert.rejects(
                () => processor.process(forbiddenInput),
                (error) => assertHttpError(error, 'IMAGE_FORMAT_NOT_SUPPORTED')
            );
        }
    });
});
