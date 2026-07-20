import jwt from 'jsonwebtoken';

import { env } from '../../utils/env.js';

import type { User } from '../../repositories/users/user.types.js';
import type { SessionRealm } from '../../utils/session-cookie.js';
import type { Secret, SignOptions } from 'jsonwebtoken';

export type AuthTokenPayload = {
    sub: number;
    username: string;
    accountType: User['accountType'];
    amr: readonly ['pwd'] | readonly ['pwd', 'webauthn'];
};

export type VerifiedSessionToken = {
    sessionId: string;
    userId: number;
    username: string;
};

function getRealmConfig(realm: SessionRealm) {
    return realm === 'app' ? env.auth.app : env.auth.admin;
}

export function signSessionToken(user: User, realm: SessionRealm, sessionId: string): string {
    const expectedAccountType = realm === 'app' ? 'community' : 'staff';

    if (user.accountType !== expectedAccountType) throw new TypeError(`Cannot issue ${realm} session for ${user.accountType} account`);

    const payload: AuthTokenPayload = {
        sub: user.id,
        username: user.username,
        accountType: user.accountType,
        amr: realm === 'app' ? ['pwd'] : ['pwd', 'webauthn']
    };
    const realmConfig = getRealmConfig(realm);
    const secret: Secret = env.auth.jwtSecret;
    const options: SignOptions = {
        audience: realmConfig.jwtAudience,
        expiresIn: realmConfig.jwtExpiresIn as SignOptions['expiresIn'],
        jwtid: sessionId
    };

    return jwt.sign(payload, secret, options);
}

export function verifySessionToken(token: string, realm: SessionRealm, ignoreExpiration = false): VerifiedSessionToken | null {
    const payload = jwt.verify(token, env.auth.jwtSecret, {
        audience: getRealmConfig(realm).jwtAudience,
        ignoreExpiration
    });

    if (!payload || typeof payload === 'string') return null;

    const data = payload as Partial<AuthTokenPayload>;
    const userId = Number(data.sub);
    const username = typeof data.username === 'string' ? data.username : '';
    const sessionId = typeof payload.jti === 'string' ? payload.jti : '';
    const expectedAccountType = realm === 'app' ? 'community' : 'staff';
    const hasExpectedAuthenticationMethods =
        realm === 'app'
            ? Array.isArray(data.amr) && data.amr.length === 1 && data.amr[0] === 'pwd'
            : Array.isArray(data.amr) && data.amr.length === 2 && data.amr.includes('pwd') && data.amr.includes('webauthn');

    if (!Number.isSafeInteger(userId) || userId <= 0 || !username || !sessionId) return null;
    if (data.accountType !== expectedAccountType || !hasExpectedAuthenticationMethods) return null;

    return { sessionId, userId, username };
}
