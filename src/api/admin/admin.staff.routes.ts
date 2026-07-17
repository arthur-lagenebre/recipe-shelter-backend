import { Router } from 'express';

import { RequirePermission } from '../../middlewares/authorization.js';
import { requireRecentStaffAuthentication, requireStaffAuth } from '../../middlewares/require-auth.js';
import { PERMISSIONS } from '../../security/permissions.js';

import type { RequestHandler } from 'express';

export type AdminStaffController = {
  list: RequestHandler;
  get: RequestHandler;
  disable: RequestHandler;
  enable: RequestHandler;
  grantRole: RequestHandler;
  revokeRole: RequestHandler;
};

export function createAdminStaffRouter(controller: AdminStaffController) {
  const router = Router();

  router.get('/', requireStaffAuth, RequirePermission(PERMISSIONS.staffRead), controller.list);
  router.get('/:staffUserId', requireStaffAuth, RequirePermission(PERMISSIONS.staffRead), controller.get);
  router.post('/:staffUserId/disable', requireStaffAuth, RequirePermission(PERMISSIONS.staffDisable), requireRecentStaffAuthentication, controller.disable);
  router.post('/:staffUserId/enable', requireStaffAuth, RequirePermission(PERMISSIONS.staffEnable), controller.enable);
  router.post('/:staffUserId/roles/:roleCode', requireStaffAuth, RequirePermission(PERMISSIONS.staffRoleGrant), requireRecentAuthenticationForSuperAdminChange, controller.grantRole);
  router.delete('/:staffUserId/roles/:roleCode', requireStaffAuth, RequirePermission(PERMISSIONS.staffRoleRevoke), requireRecentAuthenticationForSuperAdminChange, controller.revokeRole);

  return router;
}

const requireRecentAuthenticationForSuperAdminChange: RequestHandler = (req, res, next) => {
  const roleCode = typeof req.params.roleCode === 'string' ? req.params.roleCode.trim() : '';

  if (roleCode.toLowerCase() === 'superadmin')
    return requireRecentStaffAuthentication(req, res, next);

  next();
};
