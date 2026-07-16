import { Router } from 'express';

import { RequirePermission } from '../../middlewares/authorization.js';
import { requireStaffAuth } from '../../middlewares/require-auth.js';
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

    router.get('/pending', requireStaffAuth, RequirePermission(PERMISSIONS.recipesRead), controller.listPendingRecipes);
    router.get('/pending/count', requireStaffAuth, RequirePermission(PERMISSIONS.recipesRead), controller.countPendingRecipes);
    router.get('/:id', requireStaffAuth, RequirePermission(PERMISSIONS.recipesRead), controller.getRecipeAdmin);
    router.post('/:id/approve', requireStaffAuth, RequirePermission(PERMISSIONS.recipesModerate), controller.approveRecipe);
    router.post('/:id/reject', requireStaffAuth, RequirePermission(PERMISSIONS.recipesModerate), controller.rejectRecipe);
    router.post('/:id/archive', requireStaffAuth, RequirePermission(PERMISSIONS.recipesArchive), controller.archiveRecipe);
    router.delete('/:id', requireStaffAuth, RequirePermission(PERMISSIONS.recipesDelete), controller.deleteRecipe);

    return router;
}
