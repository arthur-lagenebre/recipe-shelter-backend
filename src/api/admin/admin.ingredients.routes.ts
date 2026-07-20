import { Router } from 'express';

import { RequirePermission } from '../../middlewares/authorization.js';
import { requireStaffAuth } from '../../middlewares/require-auth.js';
import { PERMISSIONS } from '../../security/permissions.js';

import type { RequestHandler } from 'express';

export type AdminIngredientsController = {
    list: RequestHandler;
    create: RequestHandler;
    update: RequestHandler;
    deprecate: RequestHandler;
    restore: RequestHandler;
    merge: RequestHandler;
    listAliases: RequestHandler;
    createAlias: RequestHandler;
    updateAlias: RequestHandler;
    deleteAlias: RequestHandler;
};

export function createAdminIngredientsRouter(controller: AdminIngredientsController) {
    const router = Router();

    router.get('/', requireStaffAuth, RequirePermission(PERMISSIONS.ingredientRead), controller.list);
    router.post('/', requireStaffAuth, RequirePermission(PERMISSIONS.ingredientCreate), controller.create);
    router.patch('/:id', requireStaffAuth, RequirePermission(PERMISSIONS.ingredientUpdate), controller.update);
    router.post('/:id/deprecate', requireStaffAuth, RequirePermission(PERMISSIONS.ingredientDeprecate), controller.deprecate);
    router.post('/:id/restore', requireStaffAuth, RequirePermission(PERMISSIONS.ingredientDeprecate), controller.restore);
    router.post('/:id/merge', requireStaffAuth, RequirePermission(PERMISSIONS.ingredientMerge), controller.merge);
    router.get('/:id/aliases', requireStaffAuth, RequirePermission(PERMISSIONS.ingredientRead), controller.listAliases);
    router.post('/:id/aliases', requireStaffAuth, RequirePermission(PERMISSIONS.ingredientAliasManage), controller.createAlias);
    router.patch('/:id/aliases/:aliasId', requireStaffAuth, RequirePermission(PERMISSIONS.ingredientAliasManage), controller.updateAlias);
    router.delete('/:id/aliases/:aliasId', requireStaffAuth, RequirePermission(PERMISSIONS.ingredientAliasManage), controller.deleteAlias);

    return router;
}
