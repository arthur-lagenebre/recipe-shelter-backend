import { Router } from 'express';

import { RequirePermission } from '../../middlewares/authorization.js';
import { requireStaffAuth } from '../../middlewares/require-auth.js';
import { PERMISSIONS } from '../../security/permissions.js';

import type { RequestHandler } from 'express';

type HealthController = {
    live: RequestHandler;
    ready: RequestHandler;
    health: RequestHandler;
};

export function createHealthRouter(controller: HealthController) {
    const router = Router();

    router.get('/live', requireStaffAuth, RequirePermission(PERMISSIONS.systemHealthRead), controller.live);
    router.get('/ready', requireStaffAuth, RequirePermission(PERMISSIONS.systemHealthRead), controller.ready);
    router.get('/', requireStaffAuth, RequirePermission(PERMISSIONS.systemHealthRead), controller.health);

    return router;
}
