import { Router } from 'express';

import { requireAdmin } from '../../middlewares/require-admin.js';
import { requireAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type HealthController = {
  live: RequestHandler;
  ready: RequestHandler;
  health: RequestHandler;
};

export function createHealthRouter(controller: HealthController) {
  const router = Router();

  router.get('/live', requireAuth, requireAdmin, controller.live);
  router.get('/ready', requireAuth, requireAdmin, controller.ready);
  router.get('/', requireAuth, requireAdmin, controller.health);

  return router;
}