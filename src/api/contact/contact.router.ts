import { Router } from 'express';

import { rateLimiter } from '../../middlewares/rate-limiter.js';

import type { RequestHandler } from 'express';

type ContactController = {
  sendContactMessage: RequestHandler;
};

const CONTACT_RATE_LIMIT_MAX_ATTEMPTS = 5;
const CONTACT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export function createContactRouter(controller: ContactController) {
  const router = Router();
  const contactRateLimiter = rateLimiter(CONTACT_RATE_LIMIT_MAX_ATTEMPTS, CONTACT_RATE_LIMIT_WINDOW_MS);

  router.post('/', contactRateLimiter, controller.sendContactMessage);

  return router;
}
