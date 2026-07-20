import { verifySessionToken } from '../services/auth/session-token.js';
import { env } from '../utils/env.js';
import { unauthorized } from '../utils/errors.js';
import { getSessionToken } from '../utils/session-cookie.js';

import type { AuthContext } from '../api/auth/auth.types.js';
import type { SessionRepository } from '../repositories/auth/session.repository.interface.js';
import type { RbacRepository } from '../repositories/rbac/rbac.repository.interface.js';
import type { User } from '../repositories/users/user.types.js';
import type { SessionRealm } from '../utils/session-cookie.js';
import type { NextFunction, Request, Response } from 'express';

type AuthUserRepository = {
    findById(id: number): Promise<User | null>;
};

let authUserRepository: AuthUserRepository | null = null;
let authRbacRepository: RbacRepository | null = null;
let authSessionRepository: SessionRepository | null = null;

export function configureAuthUserRepository(repository: AuthUserRepository): void {
    authUserRepository = repository;
}

export function configureAuthRbacRepository(repository: RbacRepository): void {
    authRbacRepository = repository;
}

export function configureAuthSessionRepository(repository: SessionRepository): void {
    authSessionRepository = repository;
}

async function resolveActiveAuth(session: { sessionId: string; userId: number }, realm: SessionRealm): Promise<AuthContext | null> {
    if (!authUserRepository || !authSessionRepository) return null;

    const sessionIsActive =
        realm === 'app'
            ? await authSessionRepository.isCommunitySessionActive(session.sessionId, session.userId)
            : await authSessionRepository.isStaffSessionActive(session.sessionId, session.userId);

    if (!sessionIsActive) return null;

    const user = await authUserRepository.findById(session.userId);
    const expectedAccountType = realm === 'app' ? 'community' : 'staff';

    if (!user || user.status !== 'active' || user.accountType !== expectedAccountType) return null;

    const permissions = realm === 'admin' && authRbacRepository ? await authRbacRepository.findPermissionCodesByStaffUserId(user.id) : [];

    return {
        userId: user.id,
        username: user.username,
        accountType: user.accountType,
        status: user.status,
        permissions
    };
}

async function authenticate(req: Request, next: NextFunction, realm: SessionRealm, optional: boolean): Promise<void> {
    const expectedAccountType = realm === 'app' ? 'community' : 'staff';

    if (req.auth) {
        if (req.auth.accountType === expectedAccountType && req.auth.status === 'active') {
            next();
            return;
        }

        if (optional) {
            delete req.auth;
            next();
            return;
        }

        next(unauthorized('Invalid session realm', 'AUTH_BAD_TOKEN'));
        return;
    }

    const token = getSessionToken(req, realm);
    if (!token) {
        next(optional ? undefined : unauthorized('Missing session cookie', 'AUTH_NO_TOKEN'));
        return;
    }

    try {
        const session = verifySessionToken(token, realm);
        if (!session) {
            next(optional ? undefined : unauthorized('Invalid token payload', 'AUTH_BAD_TOKEN'));
            return;
        }

        const activeAuth = await resolveActiveAuth(session, realm);
        if (!activeAuth) {
            next(optional ? undefined : unauthorized('Invalid or expired token', 'AUTH_BAD_TOKEN'));
            return;
        }

        req.auth = activeAuth;
        next();
    } catch {
        next(optional ? undefined : unauthorized('Invalid or expired token', 'AUTH_BAD_TOKEN'));
    }
}

export async function requireCommunityAuth(req: Request, _res: Response, next: NextFunction) {
    await authenticate(req, next, 'app', false);
}

export async function requireStaffAuth(req: Request, _res: Response, next: NextFunction) {
    await authenticate(req, next, 'admin', false);
}

export async function requireRecentStaffAuthentication(req: Request, _res: Response, next: NextFunction) {
    const proofRequired = () => unauthorized('Recent strong authentication is required', 'AUTH_RECENT_AUTHENTICATION_REQUIRED');

    if (!authSessionRepository || req.auth?.accountType !== 'staff' || req.auth.status !== 'active') {
        next(proofRequired());
        return;
    }

    const token = getSessionToken(req, 'admin');
    let session;

    try {
        session = token ? verifySessionToken(token, 'admin') : null;
    } catch {
        next(proofRequired());
        return;
    }

    if (!session || session.userId !== req.auth.userId) {
        next(proofRequired());
        return;
    }

    const authenticatedAfter = new Date(Math.floor((Date.now() - env.auth.staffMfa.reauthenticationMaxAgeMs) / 1000) * 1000);

    try {
        const isRecent = await authSessionRepository.isStaffSessionRecentlyAuthenticated(
            session.sessionId,
            session.userId,
            authenticatedAfter
        );

        next(isRecent ? undefined : proofRequired());
    } catch (error) {
        next(error);
    }
}

export async function optionalCommunityAuth(req: Request, _res: Response, next: NextFunction) {
    await authenticate(req, next, 'app', true);
}
