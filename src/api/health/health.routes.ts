import { Router } from 'express';

import { requireAuth } from '../../middlewares/require-auth.js';
import { PERMISSIONS } from '../../security/permissions.js';
import { requirePermission } from '../../services/auth/authorization.service.js';

import type { RequestHandler } from 'express';

type HealthController = {
  live: RequestHandler;
  ready: RequestHandler;
  health: RequestHandler;
};

export function createHealthRouter(controller: HealthController) {
  const router = Router();

  router.get('/live', requireAuth, requirePermission(PERMISSIONS.systemHealthRead), controller.live);
  router.get('/ready', requireAuth, requirePermission(PERMISSIONS.systemHealthRead), controller.ready);
  router.get('/', requireAuth, requirePermission(PERMISSIONS.systemHealthRead), controller.health);

  return router;
}
