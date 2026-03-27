import { Router } from 'express';

import { requireAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type AuthController = {
  register: RequestHandler;
  login: RequestHandler;
  me: RequestHandler;
  forgotPassword: RequestHandler;
  resetPassword: RequestHandler;
};

export function createAuthRouter(controller: AuthController) {
  const router = Router();

  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.get('/me', requireAuth, controller.me);
  router.post('/forgot-password', controller.forgotPassword);
  router.post('/reset-password', controller.resetPassword);

  return router;
}
