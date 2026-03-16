import jwt from 'jsonwebtoken';
import { env } from '../utils/env.js';
import { unauthorized } from '../utils/errors.js';
import type { Handler } from '../api/http/http.types.js';

export const requireAuth: Handler = (req, _res, next) => {
  const header = req.headers['authorization'];
  const value = Array.isArray(header) ? header[0] : header;

  if (!value || !value.startsWith('Bearer '))
    return next(unauthorized('Missing Bearer token', 'AUTH_NO_TOKEN'));

  const token = value.slice('Bearer '.length).trim();

  try {
    const payload = jwt.verify(token, env.auth.jwtSecret) as { sub?: unknown; username?: unknown; roleId?: unknown; };

    const userId = Number(payload.sub);
    const username = payload.username;
    const roleId = Number(payload.roleId);

    if (!Number.isFinite(userId) || typeof username !== 'string' || !Number.isFinite(roleId))
      return next(unauthorized('Invalid token payload', 'AUTH_BAD_TOKEN'));

    req.auth = { userId, username, roleId };

    return next();
  } catch {
    return next(unauthorized('Invalid or expired token', 'AUTH_BAD_TOKEN'));
  }
};