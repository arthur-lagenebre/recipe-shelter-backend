import jwt from 'jsonwebtoken';

import { env } from '../utils/env.js';
import { unauthorized } from '../utils/errors.js';
import { sessionCookieName } from '../utils/session-cookie.js';

import type { AuthContext } from '../api/auth/auth.types.js';
import type { RbacRepository } from '../repositories/rbac/rbac.repository.interface.js';
import type { User } from '../repositories/users/user.types.js';
import type { AuthTokenPayload } from '../services/auth/auth.service.js';
import type { NextFunction, Request, Response } from 'express';

type AuthUserRepository = {
  findById(id: number): Promise<User | null>;
};

type ParsedAuthContext = {
  userId: number;
  username: string;
};

let authUserRepository: AuthUserRepository | null = null;
let authRbacRepository: RbacRepository | null = null;

export function configureAuthUserRepository(repository: AuthUserRepository): void {
  authUserRepository = repository;
}

export function configureAuthRbacRepository(repository: RbacRepository): void {
  authRbacRepository = repository;
}

function getSessionToken(req: Request): string | null {
  const token = req.cookies?.[sessionCookieName];

  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

function parseAuthPayload(payload: unknown): ParsedAuthContext | null {
  if (!payload || typeof payload !== 'object')
    return null;

  const data = payload as Partial<AuthTokenPayload>;

  const userId = Number(data.sub);
  const username = typeof data.username === 'string' ? data.username : '';

  if (!Number.isFinite(userId) || !username)
    return null;

  return { userId, username };
}

async function resolveActiveAuth(auth: ParsedAuthContext): Promise<AuthContext | null> {
  if (!authUserRepository)
    return null;

  const user = await authUserRepository.findById(auth.userId);

  if (!user || user.status !== 'active')
    return null;

  const permissions = user.accountType === 'staff' && authRbacRepository
    ? await authRbacRepository.findPermissionCodesByStaffUserId(user.id)
    : [];

  return {
    userId: user.id,
    username: user.username,
    accountType: user.accountType,
    status: user.status,
    permissions
  };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = getSessionToken(req);

  if (!token)
    return next(unauthorized('Missing session cookie', 'AUTH_NO_TOKEN'));

  try {
    const payload = jwt.verify(token, env.auth.jwtSecret);
    const auth = parseAuthPayload(payload);

    if (!auth)
      return next(unauthorized('Invalid token payload', 'AUTH_BAD_TOKEN'));

    const activeAuth = await resolveActiveAuth(auth);

    if (!activeAuth)
      return next(unauthorized('Invalid or expired token', 'AUTH_BAD_TOKEN'));

    req.auth = activeAuth;
    return next();
  } catch {
    return next(unauthorized('Invalid or expired token', 'AUTH_BAD_TOKEN'));
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = getSessionToken(req);

  if (!token)
    return next();

  try {
    const payload = jwt.verify(token, env.auth.jwtSecret);
    const auth = parseAuthPayload(payload);

    if (!auth)
      return next();

    const activeAuth = await resolveActiveAuth(auth);

    if (!activeAuth)
      return next();

    req.auth = activeAuth;
    return next();
  } catch {
    return next();
  }
}
