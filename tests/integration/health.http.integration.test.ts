import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';

import { createHealthController } from '../../src/api/health/health.controller.js';
import { createHealthRouter } from '../../src/api/health/health.routes.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import {
    configureAuthRbacRepository,
    configureAuthSessionRepository,
    configureAuthUserRepository
} from '../../src/middlewares/require-auth.js';
import { PERMISSIONS } from '../../src/security/permissions.js';
import { startHttpTestServer } from '../helpers/http-test-server.js';
import { TestSessionRepository } from '../helpers/auth-session.js';

import type { User } from '../../src/repositories/users/user.types.js';
import type { HttpTestServer } from '../helpers/http-test-server.js';

const admin: User = {
    id: 1,
    mail: 'admin@example.com',
    username: 'admin',
    accountType: 'staff',
    status: 'active',
    emailValidatedAt: new Date(),
    bannedByUserId: null,
    bannedReason: null,
    bannedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
};

describe('health HTTP integration', () => {
    let server: HttpTestServer;
    let cookie: string;
    let databaseAvailable = true;

    before(async () => {
        configureAuthUserRepository({
            async findById(id) {
                return id === admin.id ? admin : null;
            }
        });
        configureAuthRbacRepository({
            async findPermissionCodesByStaffUserId() {
                return [PERMISSIONS.systemHealthRead];
            }
        });
        const sessions = new TestSessionRepository();
        configureAuthSessionRepository(sessions);
        const app = express();
        app.use(cookieParser());
        app.use('/api/v1/health', createHealthRouter(createHealthController(async () => databaseAvailable)));
        app.use(errorHandler);

        cookie = await sessions.issueCookie(admin, 'admin');
        server = await startHttpTestServer(app);
    });

    after(async () => server.close());

    it('protects health information and exposes liveness to admins', async () => {
        const unauthorized = await fetch(`${server.baseUrl}/api/v1/health/live`);
        assert.equal(unauthorized.status, 401);

        const live = await fetch(`${server.baseUrl}/api/v1/health/live`, { headers: { cookie } });
        assert.equal(live.status, 200);
        assert.deepEqual(await live.json(), { ok: true });
    });

    it('reports database readiness and outages', async () => {
        const ready = await fetch(`${server.baseUrl}/api/v1/health/ready`, { headers: { cookie } });
        assert.equal(ready.status, 200);
        assert.deepEqual(await ready.json(), { ok: true, checks: { db: true } });

        databaseAvailable = false;
        const unavailable = await fetch(`${server.baseUrl}/api/v1/health/ready`, { headers: { cookie } });
        assert.equal(unavailable.status, 503);
        assert.deepEqual(await unavailable.json(), { ok: false, checks: { db: false } });
    });
});
