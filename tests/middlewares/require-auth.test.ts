import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import jwt from 'jsonwebtoken';

import { configureAuthRbacRepository, configureAuthUserRepository, optionalAuth, requireAuth } from '../../src/middlewares/require-auth.js';
import { PERMISSIONS } from '../../src/security/permissions.js';
import { env } from '../../src/utils/env.js';
import { HttpError } from '../../src/utils/errors.js';
import { sessionCookieName } from '../../src/utils/session-cookie.js';

import type { User } from '../../src/repositories/users/user.types.js';

type AuthPayload = { userId: number; username: string; accountType: string; status: string; permissions: readonly string[] };

type MockRequest = {
    cookies: Record<string, string>;
    auth?: AuthPayload;
};

const activeUser: User = {
    id: 2,
    mail: 'user@example.com',
    username: 'active-user',
    accountType: 'community',
    status: 'active',
    emailValidatedAt: new Date('2026-05-09T10:00:00.000Z'),
    bannedByUserId: null,
    bannedReason: null,
    bannedAt: null,
    createdAt: new Date('2026-05-09T10:00:00.000Z'),
    updatedAt: new Date('2026-05-09T10:00:00.000Z')
};

class FakeAuthUsers {
    user: User | null = activeUser;

    async findById(): Promise<User | null> {
        return this.user;
    }
}

class FakeAuthRbac {
    permissions = [PERMISSIONS.usersRead];

    async findPermissionCodesByStaffUserId() {
        return this.permissions;
    }
}

function createToken(payload = { sub: 2, username: 'token-user' }): string {
    return jwt.sign(payload, env.auth.jwtSecret);
}

describe('requireAuth', () => {
    let users: FakeAuthUsers;
    let rbac: FakeAuthRbac;

    beforeEach(() => {
        users = new FakeAuthUsers();
        rbac = new FakeAuthRbac();
        configureAuthUserRepository(users);
        configureAuthRbacRepository(rbac);
    });

    it('requires a session cookie', async () => {
        let nextError: unknown;

        await requireAuth({ cookies: {} } as never, null as never, (error) => {
            nextError = error;
        });

        assert.ok(nextError instanceof HttpError);
        assert.equal(nextError.code, 'AUTH_NO_TOKEN');
    });

    it('sets active auth from a valid token and repository user', async () => {
        const req: MockRequest = { cookies: { [sessionCookieName]: createToken() } };

        await requireAuth(req as never, null as never, () => undefined);

        assert.deepEqual(req.auth, { userId: 2, username: 'active-user', accountType: 'community', status: 'active', permissions: [] });
    });

    it('rejects invalid payloads and inactive users', async () => {
        let nextError: unknown;
        await requireAuth({ cookies: { [sessionCookieName]: createToken({ sub: 2, username: '' }) } } as never, null as never, (error) => {
            nextError = error;
        });
        assert.ok(nextError instanceof HttpError);
        assert.equal(nextError.code, 'AUTH_BAD_TOKEN');

        users.user = { ...activeUser, status: 'banned' };
        nextError = undefined;
        await requireAuth({ cookies: { [sessionCookieName]: createToken() } } as never, null as never, (error) => {
            nextError = error;
        });
        assert.ok(nextError instanceof HttpError);
        assert.equal(nextError.code, 'AUTH_BAD_TOKEN');
    });

    it('loads effective permissions only for active staff accounts', async () => {
        users.user = { ...activeUser, accountType: 'staff' };
        const req: MockRequest = { cookies: { [sessionCookieName]: createToken() } };

        await requireAuth(req as never, null as never, () => undefined);

        assert.deepEqual(req.auth?.permissions, [PERMISSIONS.usersRead]);
    });

    it('lets optional auth ignore missing or invalid tokens', async () => {
        const req: MockRequest = { cookies: {} };
        let nextCalls = 0;

        await optionalAuth(req as never, null as never, () => {
            nextCalls += 1;
        });
        await optionalAuth({ cookies: { [sessionCookieName]: 'bad-token' } } as never, null as never, () => {
            nextCalls += 1;
        });

        assert.equal(nextCalls, 2);
        assert.equal('auth' in req, false);
    });

    it('sets auth for optional valid tokens', async () => {
        const req: MockRequest = { cookies: { [sessionCookieName]: createToken() } };

        await optionalAuth(req as never, null as never, () => undefined);

        assert.deepEqual(req.auth, { userId: 2, username: 'active-user', accountType: 'community', status: 'active', permissions: [] });
    });
});
