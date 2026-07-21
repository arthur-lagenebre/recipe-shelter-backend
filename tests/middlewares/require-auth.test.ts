import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { configureAuthRbacRepository, configureAuthSessionRepository, configureAuthUserRepository, optionalCommunityAuth, requireCommunityAuth, requireRecentStaffAuthentication, requireStaffAuth } from '../../src/middlewares/require-auth.js';
import { PERMISSIONS } from '../../src/security/permissions.js';
import { HttpError } from '../../src/utils/errors.js';
import { adminSessionCookieName, appSessionCookieName } from '../../src/utils/session-cookie.js';
import { TestSessionRepository } from '../helpers/auth-session.js';

import type { User } from '../../src/repositories/users/user.types.js';

type MockRequest = {
    cookies: Record<string, string>;
    auth?: {
        userId: number;
        username: string;
        accountType: User['accountType'];
        status: User['status'];
        permissions: (typeof PERMISSIONS.userRead)[];
    };
};

const communityUser: User = {
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

const staffUser: User = {
    ...communityUser,
    id: 1,
    mail: 'staff@example.com',
    username: 'active-staff',
    accountType: 'staff'
};

function cookieRequest(cookie: string): MockRequest {
    const separator = cookie.indexOf('=');
    return { cookies: { [cookie.slice(0, separator)]: cookie.slice(separator + 1) } };
}

async function getNextError(middleware: typeof requireCommunityAuth, request: MockRequest): Promise<unknown> {
    let nextError: unknown;
    await middleware(request as never, null as never, (error?: unknown) => {
        nextError = error;
    });
    return nextError;
}

describe('session authentication boundaries', () => {
    let sessions: TestSessionRepository;
    const users = new Map<number, User>();

    beforeEach(() => {
        users.clear();
        users.set(communityUser.id, communityUser);
        users.set(staffUser.id, staffUser);
        sessions = new TestSessionRepository();
        configureAuthUserRepository({
            async findById(id) {
                return users.get(id) ?? null;
            }
        });
        configureAuthRbacRepository({
            async findPermissionCodesByStaffUserId() {
                return [PERMISSIONS.userRead];
            }
        });
        configureAuthSessionRepository(sessions);
    });

    it('reuses only a matching active upstream authentication context', async () => {
        const req: MockRequest = {
            cookies: {},
            auth: {
                userId: communityUser.id,
                username: communityUser.username,
                accountType: 'community',
                status: 'active',
                permissions: []
            }
        };

        assert.equal(await getNextError(requireCommunityAuth, req), undefined);
        const crossRealmError = await getNextError(requireStaffAuth, req);
        assert.ok(crossRealmError instanceof HttpError);
        assert.equal(crossRealmError.code, 'AUTH_BAD_TOKEN');
    });

    it('requires the cookie dedicated to each realm', async () => {
        const appCookie = await sessions.issueCookie(communityUser, 'app');
        const adminCookie = await sessions.issueCookie(staffUser, 'admin');

        const missingApp = await getNextError(requireCommunityAuth, cookieRequest(adminCookie));
        assert.ok(missingApp instanceof HttpError);
        assert.equal(missingApp.code, 'AUTH_NO_TOKEN');

        const missingAdmin = await getNextError(requireStaffAuth, cookieRequest(appCookie));
        assert.ok(missingAdmin instanceof HttpError);
        assert.equal(missingAdmin.code, 'AUTH_NO_TOKEN');
    });

    it('loads community auth only from an active app session', async () => {
        const req = cookieRequest(await sessions.issueCookie(communityUser, 'app'));

        assert.equal(await getNextError(requireCommunityAuth, req), undefined);
        assert.deepEqual(req.auth, {
            userId: communityUser.id,
            username: communityUser.username,
            accountType: 'community',
            status: 'active',
            permissions: []
        });
    });

    it('loads permissions only from an MFA-backed active admin session', async () => {
        const req = cookieRequest(await sessions.issueCookie(staffUser, 'admin'));

        assert.equal(await getNextError(requireStaffAuth, req), undefined);
        assert.deepEqual(req.auth?.permissions, [PERMISSIONS.userRead]);
    });

    it('requires the current MFA-backed staff session to have a recent strong authentication', async () => {
        const freshRequest = cookieRequest(await sessions.issueCookie(staffUser, 'admin'));
        assert.equal(await getNextError(requireStaffAuth, freshRequest), undefined);
        assert.equal(await getNextError(requireRecentStaffAuthentication, freshRequest), undefined);

        const staleRequest = cookieRequest(
            await sessions.issueCookie(staffUser, 'admin', {
                mfaVerifiedAt: new Date(Date.now() - 301_000)
            })
        );
        assert.equal(await getNextError(requireStaffAuth, staleRequest), undefined);
        const staleError = await getNextError(requireRecentStaffAuthentication, staleRequest);

        assert.ok(staleError instanceof HttpError);
        assert.equal(staleError.statusCode, 401);
        assert.equal(staleError.code, 'AUTH_RECENT_AUTHENTICATION_REQUIRED');
    });

    it('rejects an app token copied into the admin cookie because its audience is wrong', async () => {
        const appCookie = await sessions.issueCookie(communityUser, 'app');
        const appToken = appCookie.slice(appCookie.indexOf('=') + 1);
        const error = await getNextError(requireStaffAuth, {
            cookies: { [adminSessionCookieName]: appToken }
        });

        assert.ok(error instanceof HttpError);
        assert.equal(error.code, 'AUTH_BAD_TOKEN');
    });

    it('rejects revoked sessions and users that are no longer active', async () => {
        const cookie = await sessions.issueCookie(communityUser, 'app');
        sessions.communitySessions.clear();
        let error = await getNextError(requireCommunityAuth, cookieRequest(cookie));
        assert.ok(error instanceof HttpError);
        assert.equal(error.code, 'AUTH_BAD_TOKEN');

        const secondCookie = await sessions.issueCookie(communityUser, 'app');
        users.set(communityUser.id, { ...communityUser, status: 'banned' });
        error = await getNextError(requireCommunityAuth, cookieRequest(secondCookie));
        assert.ok(error instanceof HttpError);
        assert.equal(error.code, 'AUTH_BAD_TOKEN');
    });

    it('lets optional community auth ignore absent, malformed and admin tokens', async () => {
        let nextCalls = 0;
        const requests: MockRequest[] = [
            { cookies: {} },
            { cookies: { [appSessionCookieName]: 'bad-token' } },
            cookieRequest(await sessions.issueCookie(staffUser, 'admin'))
        ];

        for (const req of requests) {
            await optionalCommunityAuth(req as never, null as never, () => {
                nextCalls += 1;
            });
            assert.equal(req.auth, undefined);
        }

        assert.equal(nextCalls, requests.length);
    });
});
