import { Router } from 'express';

import { requireAuth } from '../../middlewares/require-auth.js';

import type { PasswordResetService } from '../../services/auth/password-reset.service.js';
import type { RequestHandler } from 'express';

type AuthController = {
  register: RequestHandler;
  login: RequestHandler;
  me: RequestHandler;
  makeForgotPasswordHandler: (service: PasswordResetService) => RequestHandler;
  makeResetPasswordHandler: (service: PasswordResetService) => RequestHandler;
};

export function createAuthRouter(controller: AuthController, passwordResetService: PasswordResetService) {
  const router = Router();

  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.get('/me', requireAuth, controller.me);
  router.post('/forgot-password', controller.makeForgotPasswordHandler(passwordResetService));
  router.post('/reset-password', controller.makeResetPasswordHandler(passwordResetService));

  return router;
}
