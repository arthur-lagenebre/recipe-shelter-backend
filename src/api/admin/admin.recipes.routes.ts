import { Router } from 'express';

import { RequirePermission } from '../../middlewares/authorization.js';
import { requireAuth } from '../../middlewares/require-auth.js';
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

    router.get('/pending', requireAuth, RequirePermission(PERMISSIONS.recipesRead), controller.listPendingRecipes);
    router.get('/pending/count', requireAuth, RequirePermission(PERMISSIONS.recipesRead), controller.countPendingRecipes);
    router.get('/:id', requireAuth, RequirePermission(PERMISSIONS.recipesRead), controller.getRecipeAdmin);
    router.post('/:id/approve', requireAuth, RequirePermission(PERMISSIONS.recipesModerate), controller.approveRecipe);
    router.post('/:id/reject', requireAuth, RequirePermission(PERMISSIONS.recipesModerate), controller.rejectRecipe);
    router.post('/:id/archive', requireAuth, RequirePermission(PERMISSIONS.recipesArchive), controller.archiveRecipe);
    router.delete('/:id', requireAuth, RequirePermission(PERMISSIONS.recipesDelete), controller.deleteRecipe);

    return router;
}
