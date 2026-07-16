import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';

import { adminAuthorizationPolicies } from '../../src/api/admin/admin.authorization.js';
import { createAdminUsersController } from '../../src/api/admin/admin.users.controller.js';
import { createAdminUsersRouter } from '../../src/api/admin/admin.users.routes.js';
import { CommunityOnly, EnforceAuthorizationPolicies, StaffOnly } from '../../src/middlewares/authorization.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { configureAuthRbacRepository, configureAuthSessionRepository, configureAuthUserRepository, requireCommunityAuth, requireStaffAuth } from '../../src/middlewares/require-auth.js';
import { PERMISSIONS } from '../../src/security/permissions.js';
import { AdminUserService } from '../../src/services/admin/admin.users.service.js';
import { TestSessionRepository } from '../helpers/auth-session.js';
import { startHttpTestServer } from '../helpers/http-test-server.js';

import type { AdminUserRepository } from '../../src/repositories/admin/admin.users.repository.interface.js';
import type { UserRepository } from '../../src/repositories/users/user.repository.interface.js';
import type { User } from '../../src/repositories/users/user.types.js';
import type { HttpTestServer } from '../helpers/http-test-server.js';

const createdAt = new Date('2026-07-13T10:00:00.000Z');

function createUser(id: number, username: string, accountType: User['accountType']): User {
    return {
        id,
        mail: `${username}@example.com`,
        username,
        accountType,
        status: 'active',
        emailValidatedAt: createdAt,
        bannedByUserId: null,
        bannedReason: null,
        bannedAt: null,
        createdAt,
        updatedAt: createdAt
    };
}

describe('admin user access HTTP integration', () => {
    let server: HttpTestServer;
    let adminCookie: string;
    let userCookie: string;
    const users = new Map<number, User>([
        [1, createUser(1, 'admin', 'staff')],
        [2, createUser(2, 'alice', 'community')]
    ]);

    before(async () => {
        const userRepository = {
            async findById(id: number) { return users.get(id) ?? null; }
        };
        const adminRepository = {
            async ban(userId: number, adminUserId: number, reason: string) {
                const user = users.get(userId);
                if (!user)
                    return false;
                users.set(userId, {
                    ...user,
                    status: 'banned',
                    bannedByUserId: adminUserId,
                    bannedReason: reason,
                    bannedAt: new Date()
                });
                return true;
            },
            async unban(userId: number) {
                const user = users.get(userId);
                if (!user)
                    return false;
                users.set(userId, {
                    ...user,
                    status: 'active',
                    bannedByUserId: null,
                    bannedReason: null,
                    bannedAt: null
                });
                return true;
            }
        } as unknown as AdminUserRepository;
        const service = new AdminUserService(
            userRepository as unknown as UserRepository,
            adminRepository
        );
        const app = express();

        configureAuthUserRepository(userRepository);
        configureAuthRbacRepository({
            async findPermissionCodesByStaffUserId(staffUserId) {
                return staffUserId === 1 ? [PERMISSIONS.usersModerate] : [];
            }
        });
        const sessions = new TestSessionRepository();
        configureAuthSessionRepository(sessions);
        app.use(cookieParser());
        app.use(express.json());
        app.get('/protected', requireCommunityAuth, (req, res) => res.status(200).json({ userId: req.auth?.userId }));
        app.get('/community-only', requireCommunityAuth, CommunityOnly, (_req, res) => res.status(200).json({ ok: true }));
        app.get('/staff-only', requireStaffAuth, StaffOnly, (_req, res) => res.status(200).json({ ok: true }));
        const adminRouter = express.Router();
        adminRouter.use(requireStaffAuth, EnforceAuthorizationPolicies(adminAuthorizationPolicies));
        adminRouter.use('/users', createAdminUsersRouter(createAdminUsersController(service)));
        app.use('/api/v1/admin', adminRouter);
        app.use(errorHandler);

        adminCookie = await sessions.issueCookie(users.get(1)!, 'admin');
        userCookie = await sessions.issueCookie(users.get(2)!, 'app');
        server = await startHttpTestServer(app);
    });

    after(async () => server.close());

    it('blocks non-admin moderation requests', async () => {
        const response = await fetch(`${server.baseUrl}/api/v1/admin/users/2/ban`, {
            method: 'POST',
            headers: { cookie: userCookie, 'content-type': 'application/json' },
            body: JSON.stringify({ reason: 'Repeated abusive behaviour.' })
        });

        assert.equal(response.status, 401);
        assert.equal((await response.json() as { error: { code: string } }).error.code, 'AUTH_NO_TOKEN');
    });

    it('enforces community and staff account boundaries', async () => {
        const [communityAllowed, communityDenied, staffAllowed, staffDenied] = await Promise.all([
            fetch(`${server.baseUrl}/community-only`, { headers: { cookie: userCookie } }),
            fetch(`${server.baseUrl}/staff-only`, { headers: { cookie: userCookie } }),
            fetch(`${server.baseUrl}/staff-only`, { headers: { cookie: adminCookie } }),
            fetch(`${server.baseUrl}/community-only`, { headers: { cookie: adminCookie } })
        ]);

        assert.equal(communityAllowed.status, 200);
        assert.equal(staffAllowed.status, 200);
        assert.equal(communityDenied.status, 401);
        assert.equal((await communityDenied.json() as { error: { code: string } }).error.code, 'AUTH_NO_TOKEN');
        assert.equal(staffDenied.status, 401);
        assert.equal((await staffDenied.json() as { error: { code: string } }).error.code, 'AUTH_NO_TOKEN');
    });

    it('invalidates a banned user session and restores it after unban', async () => {
        const ban = await fetch(`${server.baseUrl}/api/v1/admin/users/2/ban`, {
            method: 'POST',
            headers: { cookie: adminCookie, 'content-type': 'application/json' },
            body: JSON.stringify({ reason: 'Repeated abusive behaviour.' })
        });
        assert.equal(ban.status, 200);
        assert.deepEqual(await ban.json(), { ok: true });

        const bannedSession = await fetch(`${server.baseUrl}/protected`, {
            headers: { cookie: userCookie }
        });
        assert.equal(bannedSession.status, 401);
        assert.equal((await bannedSession.json() as { error: { code: string } }).error.code, 'AUTH_BAD_TOKEN');

        const unban = await fetch(`${server.baseUrl}/api/v1/admin/users/2/unban`, {
            method: 'POST',
            headers: { cookie: adminCookie, 'content-type': 'application/json' },
            body: JSON.stringify({ reason: 'Appeal accepted after review.' })
        });
        assert.equal(unban.status, 200);

        const restoredSession = await fetch(`${server.baseUrl}/protected`, {
            headers: { cookie: userCookie }
        });
        assert.equal(restoredSession.status, 200);
        assert.deepEqual(await restoredSession.json(), { userId: 2 });
    });
});
