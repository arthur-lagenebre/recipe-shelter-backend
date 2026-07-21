import { Router } from 'express';

import { RequirePermission } from '../../middlewares/authorization.js';
import { requireStaffAuth } from '../../middlewares/require-auth.js';
import { PERMISSIONS } from '../../security/permissions.js';

import type { RequestHandler } from 'express';

export type AdminCatalogProposalsController = {
    list: RequestHandler;
    acceptTag: RequestHandler;
    acceptIngredient: RequestHandler;
    acceptEquipment: RequestHandler;
    reject: RequestHandler;
    associateTag: RequestHandler;
    associateIngredient: RequestHandler;
    associateEquipment: RequestHandler;
    convertIngredientToAlias: RequestHandler;
};

export function createAdminCatalogProposalsRouter(controller: AdminCatalogProposalsController) {
    const router = Router();

    router.get('/', requireStaffAuth, RequirePermission(PERMISSIONS.catalogManage), controller.list);
    router.post(
        '/tags/:id/accept',
        requireStaffAuth,
        RequirePermission(PERMISSIONS.catalogManage),
        RequirePermission(PERMISSIONS.tagCreate),
        controller.acceptTag
    );
    router.post(
        '/ingredients/:id/accept',
        requireStaffAuth,
        RequirePermission(PERMISSIONS.catalogManage),
        RequirePermission(PERMISSIONS.ingredientCreate),
        controller.acceptIngredient
    );
    router.post(
        '/equipments/:id/accept',
        requireStaffAuth,
        RequirePermission(PERMISSIONS.catalogManage),
        RequirePermission(PERMISSIONS.equipmentCreate),
        controller.acceptEquipment
    );
    router.post('/:id/reject', requireStaffAuth, RequirePermission(PERMISSIONS.catalogManage), controller.reject);
    router.post('/tags/:id/associate', requireStaffAuth, RequirePermission(PERMISSIONS.catalogManage), controller.associateTag);
    router.post(
        '/ingredients/:id/associate',
        requireStaffAuth,
        RequirePermission(PERMISSIONS.catalogManage),
        controller.associateIngredient
    );
    router.post('/equipments/:id/associate', requireStaffAuth, RequirePermission(PERMISSIONS.catalogManage), controller.associateEquipment);
    router.post(
        '/ingredients/:id/alias',
        requireStaffAuth,
        RequirePermission(PERMISSIONS.catalogManage),
        RequirePermission(PERMISSIONS.ingredientAliasManage),
        controller.convertIngredientToAlias
    );

    return router;
}
