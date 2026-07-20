import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import jwt from 'jsonwebtoken';

import { signSessionToken, verifySessionToken } from '../../../src/services/auth/session-token.js';
import { env } from '../../../src/utils/env.js';

import type { User } from '../../../src/repositories/users/user.types.js';
import type { SessionRealm } from '../../../src/utils/session-cookie.js';
import type { SignOptions } from 'jsonwebtoken';

const communityUser: User = {
    id: 42,
    mail: 'chef@example.com',
    username: 'chef',
    accountType: 'community',
    status: 'active',
    emailValidatedAt: new Date('2026-01-01T00:00:00.000Z'),
    bannedByUserId: null,
    bannedReason: null,
    bannedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z')
};

const validAppPayload = {
    sub: communityUser.id,
    username: communityUser.username,
    accountType: 'community',
    amr: ['pwd']
};

function signPayload(payload: Record<string, unknown>, realm: SessionRealm, sessionId: string | null): string {
    const realmConfig = realm === 'app' ? env.auth.app : env.auth.admin;
    const options: SignOptions = {
        audience: realmConfig.jwtAudience,
        expiresIn: '1h'
    };

    if (sessionId) options.jwtid = sessionId;

    return jwt.sign(payload, env.auth.jwtSecret, options);
}

describe('session token claims', () => {
    it('refuses to issue tokens across account realms', () => {
        const staffUser: User = { ...communityUser, accountType: 'staff', status: 'active' };

        assert.throws(() => signSessionToken(communityUser, 'admin', 'admin-session'), /Cannot issue admin session/);
        assert.throws(() => signSessionToken(staffUser, 'app', 'app-session'), /Cannot issue app session/);
    });

    it('rejects missing or malformed identity and session claims', () => {
        const invalidTokens = [
            signPayload({ ...validAppPayload, sub: 'not-a-user-id' }, 'app', 'session-id'),
            signPayload({ ...validAppPayload, sub: 0 }, 'app', 'session-id'),
            signPayload({ ...validAppPayload, username: 123 }, 'app', 'session-id'),
            signPayload(validAppPayload, 'app', null)
        ];

        for (const token of invalidTokens) assert.equal(verifySessionToken(token, 'app'), null);
    });

    it('rejects account types and authentication methods from the wrong realm', () => {
        const invalidTokens: Array<[string, SessionRealm]> = [
            [signPayload({ ...validAppPayload, accountType: 'staff' }, 'app', 'app-session'), 'app'],
            [signPayload({ ...validAppPayload, amr: [] }, 'app', 'app-session'), 'app'],
            [signPayload({ ...validAppPayload, accountType: 'staff', amr: ['pwd'] }, 'admin', 'admin-session'), 'admin']
        ];

        for (const [token, realm] of invalidTokens) assert.equal(verifySessionToken(token, realm), null);
    });
});
