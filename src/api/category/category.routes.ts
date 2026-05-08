import { Router } from 'express';

import type { RequestHandler } from 'express';

type CategoryController = {
    getCategories: RequestHandler;
    getCategory: RequestHandler;
};

export function createCategoryRouter(controller: CategoryController) {
    const router = Router();

    router.get('/', controller.getCategories);
    router.get('/:id', controller.getCategory);

    return router;
}