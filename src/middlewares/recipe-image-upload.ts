import multer from 'multer';

import { MAX_RECIPE_IMAGE_BYTES } from '../services/recipes/recipe-image.processor.js';
import { badRequest } from '../utils/errors.js';

import type { NextFunction, Request, Response } from 'express';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_RECIPE_IMAGE_BYTES,
        files: 1,
        fields: 1,
        fieldSize: 1024
    }
}).single('image');

export function uploadRecipeImage(req: Request, res: Response, next: NextFunction): void {
    upload(req, res, (error: unknown) => {
        if (!error) {
            next();
            return;
        }

        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
            next(badRequest('Image file exceeds the 10 MB limit', 'IMAGE_TOO_LARGE'));
            return;
        }

        if (error instanceof multer.MulterError) {
            next(badRequest('Exactly one image file is allowed in the image field', 'IMAGE_INVALID'));
            return;
        }

        next(badRequest('Image upload is invalid', 'IMAGE_INVALID'));
    });
}
