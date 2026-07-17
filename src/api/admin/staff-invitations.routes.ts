import { Router } from 'express';

import { RequirePermission } from '../../middlewares/authorization.js';
import { requireStaffAuth } from '../../middlewares/require-auth.js';
import { PERMISSIONS } from '../../security/permissions.js';

import type { RequestHandler } from 'express';

export type StaffInvitationsController = {
  create: RequestHandler;
};

export function createStaffInvitationsRouter(controller: StaffInvitationsController) {
  const router = Router();

  router.post('/', requireStaffAuth, RequirePermission(PERMISSIONS.staffCreate), controller.create);

  return router;
}
