import { Router } from 'express';

import { requireAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type CategoryController = {
    getCategories: RequestHandler;
    getCategory: RequestHandler;
};

export function createCategoryRouter(controller: CategoryController) {
    const router = Router();

    router.get('/', requireAuth, controller.getCategories);
    router.get('/:id', requireAuth, controller.getCategory);

    return router;
}