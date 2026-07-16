import { Router } from 'express';

import { RequirePermission } from '../../middlewares/authorization.js';
import { requireAuth } from '../../middlewares/require-auth.js';
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

    router.get('/banned', requireAuth, RequirePermission(PERMISSIONS.usersRead), controller.listBannedUsers);
    router.get('/banned/count', requireAuth, RequirePermission(PERMISSIONS.usersRead), controller.countBannedUsers);
    router.get('/:id', requireAuth, RequirePermission(PERMISSIONS.usersRead), controller.getUserProfile);
    router.post('/:id/ban', requireAuth, RequirePermission(PERMISSIONS.usersModerate), controller.banUser);
    router.post('/:id/unban', requireAuth, RequirePermission(PERMISSIONS.usersModerate), controller.unbanUser);

    return router;
}
