import { forbidden } from '../utils/errors.js';

import type { PermissionCode } from '../security/permissions.js';
import type { RequestHandler } from 'express';

export function requirePermission(permission: PermissionCode): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth?.permissions.includes(permission))
      return next(forbidden('Required permission is missing', 'AUTH_PERMISSION_REQUIRED'));

    return next();
  };
}
