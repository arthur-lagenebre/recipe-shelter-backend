import { Router } from 'express';

import { requireAdmin } from '../../middlewares/require-admin.js';
import { requireAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type AdminRecipesController = {
    listPendingRecipes: RequestHandler;
    countPendingRecipes: RequestHandler;
    getRecipeAdmin: RequestHandler;
    approveRecipe: RequestHandler;
    rejectRecipe: RequestHandler;
    archiveRecipe: RequestHandler;
    deleteRecipe: RequestHandler;
};

export function createAdminRecipesRouter(controller: AdminRecipesController) {
    const router = Router();

    router.get('/', requireAuth, requireAdmin, controller.listPendingRecipes);
    router.get('/count', requireAuth, requireAdmin, controller.countPendingRecipes);
    router.get('/:id', requireAuth, requireAdmin, controller.getRecipeAdmin);
    router.post('/:id/approve', requireAuth, requireAdmin, controller.approveRecipe);
    router.post('/:id/reject', requireAuth, requireAdmin, controller.rejectRecipe);
    router.post('/:id/archive', requireAuth, requireAdmin, controller.archiveRecipe);
    router.delete('/:id', requireAuth, requireAdmin, controller.deleteRecipe);

    return router;
}
