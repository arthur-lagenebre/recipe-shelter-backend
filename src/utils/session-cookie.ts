import { env } from './env.js';

import type { CookieOptions, Request, Response } from 'express';

export type SessionRealm = 'app' | 'admin';

export const appSessionCookieName = env.auth.app.sessionCookieName;
export const adminSessionCookieName = env.auth.admin.sessionCookieName;

function getRealmConfig(realm: SessionRealm) {
    return realm === 'app' ? env.auth.app : env.auth.admin;
}

function getBaseSessionCookieOptions(realm: SessionRealm): CookieOptions {
    const realmConfig = getRealmConfig(realm);
    const options: CookieOptions = {
        httpOnly: true,
        path: realmConfig.sessionCookiePath,
        sameSite: env.auth.cookie.sameSite,
        secure: env.auth.cookie.secure
    };

    if (env.auth.cookie.domain)
        options.domain = env.auth.cookie.domain;

    return options;
}

export function getSessionCookieOptions(realm: SessionRealm): CookieOptions {
    return {
        ...getBaseSessionCookieOptions(realm),
        maxAge: getRealmConfig(realm).sessionCookieMaxAgeMs
    };
}

export function getSessionClearCookieOptions(realm: SessionRealm): CookieOptions {
    return getBaseSessionCookieOptions(realm);
}

export function getSessionToken(req: Request, realm: SessionRealm): string | null {
    const token = req.cookies?.[getRealmConfig(realm).sessionCookieName];

    return typeof token === 'string' && token.trim() ? token.trim() : null;
}

export function setSessionCookie(res: Response, realm: SessionRealm, token: string): void {
    res.cookie(getRealmConfig(realm).sessionCookieName, token, getSessionCookieOptions(realm));
}

export function clearSessionCookie(res: Response, realm: SessionRealm): void {
    res.clearCookie(getRealmConfig(realm).sessionCookieName, getSessionClearCookieOptions(realm));
}
