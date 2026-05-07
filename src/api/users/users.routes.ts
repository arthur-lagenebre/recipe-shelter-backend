import { Router } from 'express';

import { requireAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type UsersController = {
  me: RequestHandler;
  updateEmail: RequestHandler;
  updatePassword: RequestHandler;
  updateUsername: RequestHandler;
};

export function createUsersRouter(controller: UsersController) {
  const router = Router();

  router.get('/me', requireAuth, controller.me);
  router.patch('/me/email', requireAuth, controller.updateEmail);
  router.patch('/me/password', requireAuth, controller.updatePassword);
  router.patch('/me/username', requireAuth, controller.updateUsername);

  return router;
}
