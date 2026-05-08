import { Router } from 'express';

import type { RequestHandler } from 'express';

type IngredientsController = {
    getIngredients: RequestHandler;
    getIngredient: RequestHandler;
};

export function createIngredientsRouter(controller: IngredientsController) {
    const router = Router();

    router.get('/', controller.getIngredients);
    router.get('/:id', controller.getIngredient);

    return router;
}