import { hasPermission, isCommunityAccount, isStaffAccount } from '../services/auth/authorization.service.js';
import { forbidden } from '../utils/errors.js';

import type { PermissionCode } from '../security/permissions.js';
import type { RequestHandler } from 'express';

export const CommunityOnly: RequestHandler = (req, _res, next) => {
  if (!isCommunityAccount(req.auth))
    return next(forbidden('Active community account is required', 'AUTH_COMMUNITY_ACCOUNT_REQUIRED'));

  return next();
};

export const StaffOnly: RequestHandler = (req, _res, next) => {
  if (!isStaffAccount(req.auth))
    return next(forbidden('Active staff account is required', 'AUTH_STAFF_ACCOUNT_REQUIRED'));

  return next();
};

export function RequirePermission(permission: PermissionCode): RequestHandler {
  return (req, _res, next) => {
    if (!hasPermission(req.auth, permission))
      return next(forbidden('Required permission is missing', 'AUTH_PERMISSION_REQUIRED'));

    return next();
  };
}
