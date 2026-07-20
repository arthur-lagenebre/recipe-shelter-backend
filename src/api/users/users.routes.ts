import { Router } from 'express';

import { optionalCommunityAuth, requireCommunityAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type UsersController = {
    me: RequestHandler;
    getUser: RequestHandler;
    updateEmail: RequestHandler;
    updatePassword: RequestHandler;
    updateUsername: RequestHandler;
};

export function createUsersRouter(controller: UsersController) {
    const router = Router();

    router.get('/me', requireCommunityAuth, controller.me);
    router.get('/:username', optionalCommunityAuth, controller.getUser);
    router.patch('/me/email', requireCommunityAuth, controller.updateEmail);
    router.patch('/me/password', requireCommunityAuth, controller.updatePassword);
    router.patch('/me/username', requireCommunityAuth, controller.updateUsername);

    return router;
}
