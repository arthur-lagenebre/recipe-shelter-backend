import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';

import { createAdminCommentsRouter } from '../../src/api/admin/admin.comments.routes.js';
import { createAdminRecipesRouter } from '../../src/api/admin/admin.recipes.routes.js';
import { createAdminUsersRouter } from '../../src/api/admin/admin.users.routes.js';
import { createHealthRouter } from '../../src/api/health/health.routes.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { configureAuthRbacRepository, configureAuthUserRepository } from '../../src/middlewares/require-auth.js';
import { PERMISSIONS } from '../../src/security/permissions.js';
import { env } from '../../src/utils/env.js';
import { startHttpTestServer } from '../helpers/http-test-server.js';

import type { User } from '../../src/repositories/users/user.types.js';
import type { PermissionCode } from '../../src/security/permissions.js';
import type { HttpTestServer } from '../helpers/http-test-server.js';
import type { RequestHandler } from 'express';

type AdminPolicy = {
    method: 'DELETE' | 'GET' | 'PATCH' | 'POST';
    path: string;
    permission: PermissionCode;
};

const ADMIN_POLICIES: AdminPolicy[] = [
    { method: 'GET', path: '/api/v1/admin/comments/moderated', permission: PERMISSIONS.commentsRead },
    { method: 'GET', path: '/api/v1/admin/comments/moderated/count', permission: PERMISSIONS.commentsRead },
    { method: 'GET', path: '/api/v1/admin/comments/soft-deleted', permission: PERMISSIONS.commentsRead },
    { method: 'GET', path: '/api/v1/admin/comments/soft-deleted/count', permission: PERMISSIONS.commentsRead },
    { method: 'POST', path: '/api/v1/admin/comments/1/hide', permission: PERMISSIONS.commentsModerate },
    { method: 'POST', path: '/api/v1/admin/comments/1/unmoderate', permission: PERMISSIONS.commentsModerate },
    { method: 'POST', path: '/api/v1/admin/comments/1/restore', permission: PERMISSIONS.commentsModerate },
    { method: 'PATCH', path: '/api/v1/admin/comments/1', permission: PERMISSIONS.commentsUpdate },
    { method: 'DELETE', path: '/api/v1/admin/comments/1', permission: PERMISSIONS.commentsDelete },
    { method: 'GET', path: '/api/v1/admin/recipes/pending', permission: PERMISSIONS.recipesRead },
    { method: 'GET', path: '/api/v1/admin/recipes/pending/count', permission: PERMISSIONS.recipesRead },
    { method: 'GET', path: '/api/v1/admin/recipes/1', permission: PERMISSIONS.recipesRead },
    { method: 'POST', path: '/api/v1/admin/recipes/1/approve', permission: PERMISSIONS.recipesModerate },
    { method: 'POST', path: '/api/v1/admin/recipes/1/reject', permission: PERMISSIONS.recipesModerate },
    { method: 'POST', path: '/api/v1/admin/recipes/1/archive', permission: PERMISSIONS.recipesArchive },
    { method: 'DELETE', path: '/api/v1/admin/recipes/1', permission: PERMISSIONS.recipesDelete },
    { method: 'GET', path: '/api/v1/admin/users/banned', permission: PERMISSIONS.usersRead },
    { method: 'GET', path: '/api/v1/admin/users/banned/count', permission: PERMISSIONS.usersRead },
    { method: 'GET', path: '/api/v1/admin/users/2', permission: PERMISSIONS.usersRead },
    { method: 'POST', path: '/api/v1/admin/users/2/ban', permission: PERMISSIONS.usersModerate },
    { method: 'POST', path: '/api/v1/admin/users/2/unban', permission: PERMISSIONS.usersModerate },
    { method: 'GET', path: '/api/v1/health/live', permission: PERMISSIONS.systemHealthRead },
    { method: 'GET', path: '/api/v1/health/ready', permission: PERMISSIONS.systemHealthRead },
    { method: 'GET', path: '/api/v1/health', permission: PERMISSIONS.systemHealthRead }
];

const staff: User = {
    id: 1,
    mail: 'staff@example.com',
    username: 'staff-user',
    accountType: 'staff',
    status: 'active',
    emailValidatedAt: new Date('2026-07-16T10:00:00.000Z'),
    bannedByUserId: null,
    bannedReason: null,
    bannedAt: null,
    createdAt: new Date('2026-07-16T10:00:00.000Z'),
    updatedAt: new Date('2026-07-16T10:00:00.000Z')
};

describe('administrative endpoint authorization policies', () => {
    let server: HttpTestServer;
    let cookie: string;
    let controllerCalls = 0;
    let grantedPermissions: PermissionCode[] = [];

    before(async () => {
        configureAuthUserRepository({
            async findById(id) {
                return id === staff.id ? staff : null;
            }
        });
        configureAuthRbacRepository({
            async findPermissionCodesByStaffUserId() {
                return [...grantedPermissions];
            }
        });

        const endpointHandler: RequestHandler = (_req, res) => {
            controllerCalls += 1;
            res.status(204).end();
        };
        const app = express();

        app.use(cookieParser());
        app.use('/api/v1/admin/comments', createAdminCommentsRouter({
            listModeratedComments: endpointHandler,
            countModeratedComments: endpointHandler,
            listSoftDeletedComments: endpointHandler,
            countSoftDeletedComments: endpointHandler,
            hideComment: endpointHandler,
            unmoderateComment: endpointHandler,
            restoreComment: endpointHandler,
            updateComment: endpointHandler,
            deleteComment: endpointHandler
        }));
        app.use('/api/v1/admin/recipes', createAdminRecipesRouter({
            listPendingRecipes: endpointHandler,
            countPendingRecipes: endpointHandler,
            getRecipeAdmin: endpointHandler,
            approveRecipe: endpointHandler,
            rejectRecipe: endpointHandler,
            archiveRecipe: endpointHandler,
            deleteRecipe: endpointHandler
        }));
        app.use('/api/v1/admin/users', createAdminUsersRouter({
            listBannedUsers: endpointHandler,
            countBannedUsers: endpointHandler,
            getUserProfile: endpointHandler,
            banUser: endpointHandler,
            unbanUser: endpointHandler
        }));
        app.use('/api/v1/health', createHealthRouter({
            live: endpointHandler,
            ready: endpointHandler,
            health: endpointHandler
        }));
        app.use(errorHandler);

        cookie = `${env.auth.sessionCookieName}=${jwt.sign({
            sub: staff.id,
            username: staff.username
        }, env.auth.jwtSecret)}`;
        server = await startHttpTestServer(app);
    });

    after(async () => server.close());

    it('requires authentication and the exact declared permission on every administrative endpoint', async () => {
        for (const policy of ADMIN_POLICIES) {
            grantedPermissions = [policy.permission];
            const callsBeforeAllowedRequest = controllerCalls;
            const allowed = await fetch(`${server.baseUrl}${policy.path}`, {
                method: policy.method,
                headers: { cookie }
            });

            assert.equal(allowed.status, 204, `${policy.method} ${policy.path} must allow ${policy.permission}`);
            assert.equal(controllerCalls, callsBeforeAllowedRequest + 1);

            grantedPermissions = [];
            const forbidden = await fetch(`${server.baseUrl}${policy.path}`, {
                method: policy.method,
                headers: { cookie }
            });

            assert.equal(forbidden.status, 403, `${policy.method} ${policy.path} must deny missing permission`);
            assert.equal(
                (await forbidden.json() as { error: { code: string } }).error.code,
                'AUTH_PERMISSION_REQUIRED'
            );
            assert.equal(controllerCalls, callsBeforeAllowedRequest + 1);

            const unauthorized = await fetch(`${server.baseUrl}${policy.path}`, { method: policy.method });

            assert.equal(unauthorized.status, 401, `${policy.method} ${policy.path} must require authentication`);
            assert.equal(
                (await unauthorized.json() as { error: { code: string } }).error.code,
                'AUTH_NO_TOKEN'
            );
            assert.equal(controllerCalls, callsBeforeAllowedRequest + 1);
        }
    });
});
