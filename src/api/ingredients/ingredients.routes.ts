import { Router } from 'express';

import { requireAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type IngredientsController = {
    getIngredients: RequestHandler;
    getIngredient: RequestHandler;
};

export function createIngredientsRouter(controller: IngredientsController) {
    const router = Router();

    router.get('/', requireAuth, controller.getIngredients);
    router.get('/:id', requireAuth, controller.getIngredient);

    return router;
}