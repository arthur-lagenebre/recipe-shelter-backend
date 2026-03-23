import { Router } from 'express';

import { requireAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type UsersController = {
  me: RequestHandler;
  updateEmail: RequestHandler;
  updatePassword: RequestHandler;
};

export function createUsersRouter(controller: UsersController) {
  const router = Router();

  router.get('/me', requireAuth, controller.me);
  router.patch('/email', requireAuth, controller.updateEmail);
  router.patch('/password', requireAuth, controller.updatePassword);

  return router;
}