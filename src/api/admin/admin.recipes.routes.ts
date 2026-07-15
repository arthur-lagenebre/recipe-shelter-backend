import { Router } from 'express';

import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePermission } from '../../middlewares/require-permission.js';
import { PERMISSIONS } from '../../security/permissions.js';

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

    router.get('/pending', requireAuth, requirePermission(PERMISSIONS.recipesRead), controller.listPendingRecipes);
    router.get('/pending/count', requireAuth, requirePermission(PERMISSIONS.recipesRead), controller.countPendingRecipes);
    router.get('/:id', requireAuth, requirePermission(PERMISSIONS.recipesRead), controller.getRecipeAdmin);
    router.post('/:id/approve', requireAuth, requirePermission(PERMISSIONS.recipesModerate), controller.approveRecipe);
    router.post('/:id/reject', requireAuth, requirePermission(PERMISSIONS.recipesModerate), controller.rejectRecipe);
    router.post('/:id/archive', requireAuth, requirePermission(PERMISSIONS.recipesArchive), controller.archiveRecipe);
    router.delete('/:id', requireAuth, requirePermission(PERMISSIONS.recipesDelete), controller.deleteRecipe);

    return router;
}
