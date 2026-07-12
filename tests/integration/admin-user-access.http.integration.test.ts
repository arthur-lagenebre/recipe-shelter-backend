import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';

import { createAdminUsersController } from '../../src/api/admin/admin.users.controller.js';
import { createAdminUsersRouter } from '../../src/api/admin/admin.users.routes.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { configureAuthUserRepository, requireAuth } from '../../src/middlewares/require-auth.js';
import { AdminUserService } from '../../src/services/admin/admin.users.service.js';
import { env } from '../../src/utils/env.js';
import { startHttpTestServer } from '../helpers/http-test-server.js';

import type { AdminUserRepository } from '../../src/repositories/admin/admin.users.repository.interface.js';
import type { UserRepository } from '../../src/repositories/users/user.repository.interface.js';
import type { User } from '../../src/repositories/users/user.types.js';
import type { HttpTestServer } from '../helpers/http-test-server.js';

const createdAt = new Date('2026-07-13T10:00:00.000Z');

function createUser(id: number, username: string, roleId: number): User {
    return {
        id,
        mail: `${username}@example.com`,
        username,
        roleId,
        status: 'active',
        emailValidatedAt: createdAt,
        bannedByUserId: null,
        bannedReason: null,
        bannedAt: null,
        createdAt,
        updatedAt: createdAt
    };
}

function sessionCookie(user: User): string {
    const token = jwt.sign({
        sub: user.id,
        username: user.username,
        roleId: user.roleId,
        status: user.status
    }, env.auth.jwtSecret);
    return `${env.auth.sessionCookieName}=${token}`;
}

describe('admin user access HTTP integration', () => {
    let server: HttpTestServer;
    let adminCookie: string;
    let userCookie: string;
    const users = new Map<number, User>([
        [1, createUser(1, 'admin', 1)],
        [2, createUser(2, 'alice', 2)]
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
        app.use(cookieParser());
        app.use(express.json());
        app.get('/protected', requireAuth, (req, res) => res.status(200).json({ userId: req.auth?.userId }));
        app.use('/api/v1/admin/users', createAdminUsersRouter(createAdminUsersController(service)));
        app.use(errorHandler);

        adminCookie = sessionCookie(users.get(1)!);
        userCookie = sessionCookie(users.get(2)!);
        server = await startHttpTestServer(app);
    });

    after(async () => server.close());

    it('blocks non-admin moderation requests', async () => {
        const response = await fetch(`${server.baseUrl}/api/v1/admin/users/2/ban`, {
            method: 'POST',
            headers: { cookie: userCookie, 'content-type': 'application/json' },
            body: JSON.stringify({ reason: 'Repeated abusive behaviour.' })
        });

        assert.equal(response.status, 403);
        assert.equal((await response.json() as { error: { code: string } }).error.code, 'ADMIN_ACCESS_REQUIRED');
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
