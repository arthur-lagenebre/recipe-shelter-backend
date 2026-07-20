import { Router } from 'express';

import { RequirePermission } from '../../middlewares/authorization.js';
import { requireStaffAuth } from '../../middlewares/require-auth.js';
import { PERMISSIONS } from '../../security/permissions.js';

import type { RequestHandler } from 'express';

export type StaffSessionsController = {
    listOwn: RequestHandler;
    revokeOwn: RequestHandler;
    listManaged: RequestHandler;
    revokeManaged: RequestHandler;
};

export function createAdminStaffSessionsRouter(controller: StaffSessionsController) {
    const router = Router();

    router.get('/:staffUserId/sessions', requireStaffAuth, RequirePermission(PERMISSIONS.staffRead), controller.listManaged);
    router.delete(
        '/:staffUserId/sessions/:sessionId',
        requireStaffAuth,
        RequirePermission(PERMISSIONS.staffSessionRevoke),
        controller.revokeManaged
    );

    return router;
}
