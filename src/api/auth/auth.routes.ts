import { Router } from 'express';

import { rateLimiter } from '../../middlewares/rate-limiter.js';
import { requireCommunityAuth, requireStaffAuth } from '../../middlewares/require-auth.js';
import { env } from '../../utils/env.js';

import type { StaffSessionsController } from '../admin/staff-sessions.routes.js';
import type { RequestHandler } from 'express';

type AuthController = {
  register: RequestHandler;
  login: RequestHandler;
  staffLoginOptions: RequestHandler;
  staffLoginVerify: RequestHandler;
  staffMfaEnrollmentOptions: RequestHandler;
  staffMfaEnrollmentVerify: RequestHandler;
  me: RequestHandler;
  logout: RequestHandler;
  staffLogout: RequestHandler;
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
  router.get('/me', requireCommunityAuth, controller.me);
  router.post('/logout', controller.logout);
  router.post('/validate-email', authRateLimiter, controller.validateEmail);
  router.post('/resend-validation-email', authRateLimiter, controller.resendValidationEmail);
  router.post('/forgot-password', authRateLimiter, controller.forgotPassword);
  router.post('/reset-password', controller.resetPassword);

  return router;
}

export function createStaffAuthRouter(controller: AuthController, staffSessionsController: StaffSessionsController) {
  const router = Router();
  const authRateLimiter = rateLimiter(env.auth.rateLimitMaxAttempts, env.auth.rateLimitWindowMs);

  router.post('/login/options', authRateLimiter, controller.staffLoginOptions);
  router.post('/login/verify', authRateLimiter, controller.staffLoginVerify);
  router.post('/mfa/enrollment/options', authRateLimiter, controller.staffMfaEnrollmentOptions);
  router.post('/mfa/enrollment/verify', authRateLimiter, controller.staffMfaEnrollmentVerify);
  router.get('/me', requireStaffAuth, controller.me);
  router.get('/sessions', requireStaffAuth, staffSessionsController.listOwn);
  router.delete('/sessions/:sessionId', requireStaffAuth, staffSessionsController.revokeOwn);
  router.post('/logout', controller.staffLogout);

  return router;
}
