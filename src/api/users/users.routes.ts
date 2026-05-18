import { Router } from 'express';

import { optionalAuth, requireAuth } from '../../middlewares/require-auth.js';

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

  router.get('/me', requireAuth, controller.me);
  router.get('/:username', optionalAuth, controller.getUser);
  router.patch('/me/email', requireAuth, controller.updateEmail);
  router.patch('/me/password', requireAuth, controller.updatePassword);
  router.patch('/me/username', requireAuth, controller.updateUsername);

  return router;
}
