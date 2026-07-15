import { forbidden } from '../../utils/errors.js';

import type { AuthContext } from '../../api/auth/auth.types.js';
import type { PermissionCode } from '../../security/permissions.js';
import type { RequestHandler } from 'express';

function hasActiveAccountType(auth: Readonly<AuthContext> | null | undefined, accountType: AuthContext['accountType']): boolean {
  return auth?.accountType === accountType && auth.status === 'active';
}

export function hasPermission(auth: Readonly<AuthContext> | null | undefined, permission: PermissionCode): boolean {
  return hasActiveAccountType(auth, 'staff') && auth?.permissions.includes(permission) === true;
}

export function requirePermission(permission: PermissionCode): RequestHandler {
  return (req, _res, next) => {
    if (!hasPermission(req.auth, permission))
      return next(forbidden('Required permission is missing', 'AUTH_PERMISSION_REQUIRED'));

    return next();
  };
}

export const requireCommunityAccount: RequestHandler = (req, _res, next) => {
  if (!hasActiveAccountType(req.auth, 'community'))
    return next(forbidden('Active community account is required', 'AUTH_COMMUNITY_ACCOUNT_REQUIRED'));

  return next();
};

export const requireStaffAccount: RequestHandler = (req, _res, next) => {
  if (!hasActiveAccountType(req.auth, 'staff'))
    return next(forbidden('Active staff account is required', 'AUTH_STAFF_ACCOUNT_REQUIRED'));

  return next();
};
