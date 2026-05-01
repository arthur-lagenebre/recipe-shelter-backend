import { Router } from 'express';

import { requireAdmin } from '../../middlewares/require-admin.js';
import { requireAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type AdminRecipesController = {
    listPendingRecipes: RequestHandler;
    getRecipeAdmin: RequestHandler;
    approveRecipe: RequestHandler;
    rejectRecipe: RequestHandler;
};

export function createAdminRecipesRouter(controller: AdminRecipesController) {
    const router = Router();

    router.get('/', requireAuth, requireAdmin, controller.listPendingRecipes);
    router.get('/:id', requireAuth, requireAdmin, controller.getRecipeAdmin);
    router.put('/:id/approve', requireAuth, requireAdmin, controller.approveRecipe);
    router.put('/:id/reject', requireAuth, requireAdmin, controller.rejectRecipe);

    return router;
}