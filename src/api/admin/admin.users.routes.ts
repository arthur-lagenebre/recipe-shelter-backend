import { Router } from 'express';

import { RequirePermission } from '../../middlewares/authorization.js';
import { requireStaffAuth } from '../../middlewares/require-auth.js';
import { PERMISSIONS } from '../../security/permissions.js';

import type { RequestHandler } from 'express';

type AdminUsersController = {
    listBannedUsers: RequestHandler;
    countBannedUsers: RequestHandler;
    getUserProfile: RequestHandler;
    banUser: RequestHandler;
    unbanUser: RequestHandler;
};

export function createAdminUsersRouter(controller: AdminUsersController) {
    const router = Router();

    router.get('/banned', requireStaffAuth, RequirePermission(PERMISSIONS.userRead), controller.listBannedUsers);
    router.get('/banned/count', requireStaffAuth, RequirePermission(PERMISSIONS.userRead), controller.countBannedUsers);
    router.get('/:id', requireStaffAuth, RequirePermission(PERMISSIONS.userRead), controller.getUserProfile);
    router.post('/:id/ban', requireStaffAuth, RequirePermission(PERMISSIONS.userBan), controller.banUser);
    router.post('/:id/unban', requireStaffAuth, RequirePermission(PERMISSIONS.userUnban), controller.unbanUser);

    return router;
}
