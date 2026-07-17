import { Router } from 'express';

import { RequirePermission } from '../../middlewares/authorization.js';
import { requireStaffAuth } from '../../middlewares/require-auth.js';
import { PERMISSIONS } from '../../security/permissions.js';

import type { RequestHandler } from 'express';

type AdminAuditLogsController = {
  list: RequestHandler;
};

export function createAdminAuditLogsRouter(controller: AdminAuditLogsController) {
  const router = Router();

  router.get('/', requireStaffAuth, RequirePermission(PERMISSIONS.auditRead), controller.list);

  return router;
}
