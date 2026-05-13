import { Router } from 'express';

import { requireAdmin } from '../../middlewares/require-admin.js';
import { requireAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type AdminUsersController = {
    listBannedUsers: RequestHandler;
    countBannedUsers: RequestHandler;
    banUser: RequestHandler;
    unbanUser: RequestHandler;
};

export function createAdminUsersRouter(controller: AdminUsersController) {
    const router = Router();

    router.get('/banned', requireAuth, requireAdmin, controller.listBannedUsers);
    router.get('/banned/count', requireAuth, requireAdmin, controller.countBannedUsers);
    router.post('/:id/ban', requireAuth, requireAdmin, controller.banUser);
    router.post('/:id/unban', requireAuth, requireAdmin, controller.unbanUser);

    return router;
}
