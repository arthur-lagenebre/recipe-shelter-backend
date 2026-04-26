import { Router } from 'express';

import { requireAdmin } from '../../middlewares/require-admin.js';
import { requireAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type AdminRecipesController = {
    listPendingRecipes: RequestHandler;
    approveRecipe: RequestHandler;
    rejectRecipe: RequestHandler;
};

export function createAdminRecipesRouter(controller: AdminRecipesController) {
    const router = Router();

    router.get('/', requireAuth, requireAdmin, controller.listPendingRecipes);
    router.put('/:id', requireAuth, requireAdmin, controller.approveRecipe);
    router.patch('/:id', requireAuth, requireAdmin, controller.rejectRecipe);

    return router;
}