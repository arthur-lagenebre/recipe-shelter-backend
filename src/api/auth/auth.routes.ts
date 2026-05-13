import { Router } from 'express';

import { rateLimiter } from '../../middlewares/rate-limiter.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { env } from '../../utils/env.js';

import type { RequestHandler } from 'express';

type AuthController = {
  register: RequestHandler;
  login: RequestHandler;
  me: RequestHandler;
  forgotPassword: RequestHandler;
  resetPassword: RequestHandler;
  validateEmail: RequestHandler;
  resendValidationEmail: RequestHandler;
};

export function createAuthRouter(controller: AuthController) {
  const router = Router();
  const authRateLimiter = rateLimiter(env.auth.rateLimitMaxAttempts, env.auth.rateLimitWindowMs);

  router.post('/register', authRateLimiter, controller.register);
  router.post('/login', authRateLimiter, controller.login);
  router.get('/me', requireAuth, controller.me);
  router.post('/validate-email', authRateLimiter, controller.validateEmail);
  router.post('/resend-validation-email', authRateLimiter, controller.resendValidationEmail);
  router.post('/forgot-password', authRateLimiter, controller.forgotPassword);
  router.post('/reset-password', controller.resetPassword);

  return router;
}
