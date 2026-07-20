import { Router } from 'express';

import { RequirePermission } from '../../middlewares/authorization.js';
import { requireStaffAuth } from '../../middlewares/require-auth.js';
import { PERMISSIONS } from '../../security/permissions.js';

import type { RequestHandler } from 'express';

export type AdminTagsController = {
  list: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  deprecate: RequestHandler;
  restore: RequestHandler;
  merge: RequestHandler;
};

export function createAdminTagsRouter(controller: AdminTagsController) {
  const router = Router();

  router.get('/', requireStaffAuth, RequirePermission(PERMISSIONS.tagRead), controller.list);
  router.post('/', requireStaffAuth, RequirePermission(PERMISSIONS.tagCreate), controller.create);
  router.patch('/:id', requireStaffAuth, RequirePermission(PERMISSIONS.tagUpdate), controller.update);
  router.post('/:id/deprecate', requireStaffAuth, RequirePermission(PERMISSIONS.tagDeprecate), controller.deprecate);
  router.post('/:id/restore', requireStaffAuth, RequirePermission(PERMISSIONS.tagDeprecate), controller.restore);
  router.post('/:id/merge', requireStaffAuth, RequirePermission(PERMISSIONS.tagMerge), controller.merge);

  return router;
}
