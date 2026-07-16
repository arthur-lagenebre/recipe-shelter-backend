import { Router } from 'express';

import { EnforceAuthorizationPolicies, RequirePermission } from '../../middlewares/authorization.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { PERMISSIONS } from '../../security/permissions.js';

import type { RequestHandler } from 'express';

type HealthController = {
  live: RequestHandler;
  ready: RequestHandler;
  health: RequestHandler;
};

export function createHealthRouter(controller: HealthController) {
  const router = Router();

  router.use(requireAuth, EnforceAuthorizationPolicies([
    { method: 'get', path: '/live', permission: PERMISSIONS.systemHealthRead },
    { method: 'get', path: '/ready', permission: PERMISSIONS.systemHealthRead },
    { method: 'get', path: '/', permission: PERMISSIONS.systemHealthRead }
  ]));
  router.get('/live', requireAuth, RequirePermission(PERMISSIONS.systemHealthRead), controller.live);
  router.get('/ready', requireAuth, RequirePermission(PERMISSIONS.systemHealthRead), controller.ready);
  router.get('/', requireAuth, RequirePermission(PERMISSIONS.systemHealthRead), controller.health);

  return router;
}
