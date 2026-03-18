import { Router } from 'express';
import type { RequestHandler } from 'express';
import { requireAuth } from '../../middlewares/require-auth.js';

type AuthController = {
  register: RequestHandler;
  login: RequestHandler;
  me: RequestHandler;
};

export function createAuthRouter(controller: AuthController) {
  const router = Router();

  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.get('/me', requireAuth, controller.me);

  return router;
}