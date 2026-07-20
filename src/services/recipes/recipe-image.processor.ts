import sharp from 'sharp';

import { badRequest } from '../../utils/errors.js';

import type { Metadata } from 'sharp';

export const MAX_RECIPE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_RECIPE_IMAGE_DIMENSION = 10_000;
export const RECIPE_IMAGE_WEBP_QUALITY = 82;

const MAX_INPUT_PIXELS = MAX_RECIPE_IMAGE_DIMENSION * MAX_RECIPE_IMAGE_DIMENSION;
const VARIANT_SIZES = {
    large: 1600,
    medium: 800,
    thumbnail: 400
} as const;

export type ProcessedImageVariant = {
    buffer: Buffer;
    width: number;
    height: number;
    sizeBytes: number;
    contentType: 'image/webp';
};

export type ProcessedRecipeImage = {
    originalWidth: number;
    originalHeight: number;
    large: ProcessedImageVariant;
    medium: ProcessedImageVariant;
    thumbnail: ProcessedImageVariant;
};

export class RecipeImageProcessor {
    async process(input: Buffer): Promise<ProcessedRecipeImage> {
        if (!input.length) throw badRequest('Image file is invalid', 'IMAGE_INVALID');

        if (input.length > MAX_RECIPE_IMAGE_BYTES) throw badRequest('Image file exceeds the 10 MB limit', 'IMAGE_TOO_LARGE');

        const detectedFormat = detectFormat(input);
        if (detectedFormat === 'unsupported') throw badRequest('Image format is not supported', 'IMAGE_FORMAT_NOT_SUPPORTED');

        if (detectedFormat === 'unknown') throw badRequest('Image file is invalid', 'IMAGE_INVALID');

        let metadata: Metadata;

        try {
            metadata = await sharp(input, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).metadata();
        } catch (error) {
            if (isPixelLimitError(error)) throw badRequest('Image dimensions are too large', 'IMAGE_DIMENSIONS_TOO_LARGE');

            throw badRequest('Image content cannot be decoded', 'IMAGE_INVALID');
        }

        if (metadata.format !== 'jpeg' && metadata.format !== 'png' && metadata.format !== 'webp')
            throw badRequest('Image format is not supported', 'IMAGE_FORMAT_NOT_SUPPORTED');

        if (!metadata.width || !metadata.height) throw badRequest('Image dimensions are invalid', 'IMAGE_INVALID');

        const swapsAxes = metadata.orientation !== undefined && metadata.orientation >= 5 && metadata.orientation <= 8;
        const originalWidth = swapsAxes ? metadata.height : metadata.width;
        const originalHeight = swapsAxes ? metadata.width : metadata.height;

        if (originalWidth > MAX_RECIPE_IMAGE_DIMENSION || originalHeight > MAX_RECIPE_IMAGE_DIMENSION)
            throw badRequest('Image dimensions are too large', 'IMAGE_DIMENSIONS_TOO_LARGE');

        const [large, medium, thumbnail] = await Promise.all([
            this.createVariant(input, VARIANT_SIZES.large),
            this.createVariant(input, VARIANT_SIZES.medium),
            this.createVariant(input, VARIANT_SIZES.thumbnail)
        ]);

        return { originalWidth, originalHeight, large, medium, thumbnail };
    }

    private async createVariant(input: Buffer, maximumDimension: number): Promise<ProcessedImageVariant> {
        try {
            const { data, info } = await sharp(input, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
                .rotate()
                .resize({
                    width: maximumDimension,
                    height: maximumDimension,
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .webp({ quality: RECIPE_IMAGE_WEBP_QUALITY })
                .toBuffer({ resolveWithObject: true });

            return {
                buffer: data,
                width: info.width,
                height: info.height,
                sizeBytes: data.byteLength,
                contentType: 'image/webp'
            };
        } catch {
            throw badRequest('Image content cannot be decoded', 'IMAGE_INVALID');
        }
    }
}

type DetectedFormat = 'supported' | 'unsupported' | 'unknown';

function detectFormat(input: Buffer): DetectedFormat {
    if (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return 'supported';

    if (input.length >= 8 && input.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'supported';

    if (input.length >= 12 && input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP') return 'supported';

    const prefix = input.subarray(0, 512).toString('utf8').trimStart().toLowerCase();
    const unsupportedBinary =
        input.toString('ascii', 0, 6).startsWith('GIF8') ||
        input.toString('ascii', 0, 5) === '%PDF-' ||
        input.toString('ascii', 0, 2) === 'BM' ||
        input.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) ||
        input.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]));
    const unsupportedText = prefix.startsWith('<svg') || (prefix.startsWith('<?xml') && prefix.includes('<svg'));
    const unsupportedIsoMedia = input.length >= 12 && input.toString('ascii', 4, 8) === 'ftyp';

    return unsupportedBinary || unsupportedText || unsupportedIsoMedia ? 'unsupported' : 'unknown';
}

function isPixelLimitError(error: unknown): boolean {
    return error instanceof Error && /pixel limit|too large/i.test(error.message);
}
