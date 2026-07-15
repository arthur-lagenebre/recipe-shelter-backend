import { Router } from 'express';

import { requireAuth } from '../../middlewares/require-auth.js';
import { PERMISSIONS } from '../../security/permissions.js';
import { requirePermission } from '../../services/auth/authorization.service.js';

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

    router.get('/banned', requireAuth, requirePermission(PERMISSIONS.usersRead), controller.listBannedUsers);
    router.get('/banned/count', requireAuth, requirePermission(PERMISSIONS.usersRead), controller.countBannedUsers);
    router.get('/:id', requireAuth, requirePermission(PERMISSIONS.usersRead), controller.getUserProfile);
    router.post('/:id/ban', requireAuth, requirePermission(PERMISSIONS.usersModerate), controller.banUser);
    router.post('/:id/unban', requireAuth, requirePermission(PERMISSIONS.usersModerate), controller.unbanUser);

    return router;
}
