import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../utils/env.js';
import { unauthorized } from '../utils/errors.js';

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer '))
    return next(unauthorized('Missing Bearer token', 'AUTH_NO_TOKEN'));

  const token = header.slice('Bearer '.length).trim();

  try {
    const payload = jwt.verify(token, env.auth.jwtSecret) as {
      sub?: unknown;
      username?: unknown;
      roleId?: unknown;
    };

    const userId = Number(payload.sub);
    const username = String(payload.username);
    const roleId = Number(payload.roleId);

    if (!Number.isFinite(userId) || !Number.isFinite(roleId))
      return next(unauthorized('Invalid token payload', 'AUTH_BAD_TOKEN'));

    req.auth = { userId, username, roleId };
    return next();
  } catch {
    return next(unauthorized('Invalid or expired token', 'AUTH_BAD_TOKEN'));
  }
}