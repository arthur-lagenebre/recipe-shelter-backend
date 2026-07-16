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

    router.get('/banned', requireStaffAuth, RequirePermission(PERMISSIONS.usersRead), controller.listBannedUsers);
    router.get('/banned/count', requireStaffAuth, RequirePermission(PERMISSIONS.usersRead), controller.countBannedUsers);
    router.get('/:id', requireStaffAuth, RequirePermission(PERMISSIONS.usersRead), controller.getUserProfile);
    router.post('/:id/ban', requireStaffAuth, RequirePermission(PERMISSIONS.usersModerate), controller.banUser);
    router.post('/:id/unban', requireStaffAuth, RequirePermission(PERMISSIONS.usersModerate), controller.unbanUser);

    return router;
}
