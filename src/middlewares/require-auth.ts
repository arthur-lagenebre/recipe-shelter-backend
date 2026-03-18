import jwt from 'jsonwebtoken';
import { env } from '../utils/env.js';
import { unauthorized } from '../utils/errors.js';
import type { NextFunction, Request, Response } from 'express';
import type { AuthTokenPayload } from '../services/auth/auth.service.js';
import type { AuthContext } from '../types/auth.types.js';

function parseAuthPayload(payload: unknown): AuthContext | null {
  if (!payload || typeof payload !== 'object')
    return null;

  const data = payload as Partial<AuthTokenPayload>;

  const userId = Number(data.sub);
  const roleId = Number(data.roleId);
  const username = typeof data.username === 'string' ? data.username : '';

  if (!Number.isFinite(userId) || !Number.isFinite(roleId) || !username)
    return null;

  return { userId, username, roleId };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer '))
    return next(unauthorized('Missing Bearer token', 'AUTH_NO_TOKEN'));

  const token = header.slice('Bearer '.length).trim();

  try {
    const payload = jwt.verify(token, env.auth.jwtSecret);
    const auth = parseAuthPayload(payload);

    if (!auth)
      return next(unauthorized('Invalid token payload', 'AUTH_BAD_TOKEN'));

    req.auth = auth;
    return next();
  } catch {
    return next(unauthorized('Invalid or expired token', 'AUTH_BAD_TOKEN'));
  }
}