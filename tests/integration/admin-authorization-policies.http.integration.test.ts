import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';

import { createAdminAuditLogsRouter } from '../../src/api/admin/admin-audit-logs.routes.js';
import { createAdminCommentsRouter } from '../../src/api/admin/admin.comments.routes.js';
import { adminAuthorizationPolicies } from '../../src/api/admin/admin.authorization.js';
import { createAdminRecipesRouter } from '../../src/api/admin/admin.recipes.routes.js';
import { createAdminStaffRouter } from '../../src/api/admin/admin.staff.routes.js';
import { createAdminTagsRouter } from '../../src/api/admin/admin.tags.routes.js';
import { createAdminUsersRouter } from '../../src/api/admin/admin.users.routes.js';
import { createStaffInvitationsRouter } from '../../src/api/admin/staff-invitations.routes.js';
import { createAdminStaffSessionsRouter } from '../../src/api/admin/staff-sessions.routes.js';
import { createHealthRouter } from '../../src/api/health/health.routes.js';
import { EnforceAuthorizationPolicies } from '../../src/middlewares/authorization.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { configureAuthRbacRepository, configureAuthSessionRepository, configureAuthUserRepository, requireStaffAuth } from '../../src/middlewares/require-auth.js';
import { PERMISSIONS } from '../../src/security/permissions.js';
import { logger } from '../../src/utils/logger.js';
import { TestSessionRepository } from '../helpers/auth-session.js';
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
    { method: 'GET', path: '/api/v1/admin/audit-logs', permission: PERMISSIONS.auditRead },
    { method: 'GET', path: '/api/v1/admin/comments/moderated', permission: PERMISSIONS.commentReview },
    { method: 'GET', path: '/api/v1/admin/comments/moderated/count', permission: PERMISSIONS.commentReview },
    { method: 'GET', path: '/api/v1/admin/comments/soft-deleted', permission: PERMISSIONS.commentReview },
    { method: 'GET', path: '/api/v1/admin/comments/soft-deleted/count', permission: PERMISSIONS.commentReview },
    { method: 'POST', path: '/api/v1/admin/comments/1/hide', permission: PERMISSIONS.commentHide },
    { method: 'POST', path: '/api/v1/admin/comments/1/unmoderate', permission: PERMISSIONS.commentRestore },
    { method: 'POST', path: '/api/v1/admin/comments/1/restore', permission: PERMISSIONS.commentRestore },
    { method: 'PATCH', path: '/api/v1/admin/comments/1', permission: PERMISSIONS.commentsUpdate },
    { method: 'DELETE', path: '/api/v1/admin/comments/1', permission: PERMISSIONS.commentsDelete },
    { method: 'GET', path: '/api/v1/admin/recipes/pending', permission: PERMISSIONS.recipeReview },
    { method: 'GET', path: '/api/v1/admin/recipes/pending/count', permission: PERMISSIONS.recipeReview },
    { method: 'GET', path: '/api/v1/admin/recipes/1', permission: PERMISSIONS.recipeReview },
    { method: 'POST', path: '/api/v1/admin/recipes/1/approve', permission: PERMISSIONS.recipePublish },
    { method: 'POST', path: '/api/v1/admin/recipes/1/reject', permission: PERMISSIONS.recipeReject },
    { method: 'POST', path: '/api/v1/admin/recipes/1/archive', permission: PERMISSIONS.recipeArchive },
    { method: 'DELETE', path: '/api/v1/admin/recipes/1', permission: PERMISSIONS.recipesDelete },
    { method: 'GET', path: '/api/v1/admin/users/banned', permission: PERMISSIONS.userRead },
    { method: 'GET', path: '/api/v1/admin/users/banned/count', permission: PERMISSIONS.userRead },
    { method: 'GET', path: '/api/v1/admin/users/2', permission: PERMISSIONS.userRead },
    { method: 'POST', path: '/api/v1/admin/users/2/ban', permission: PERMISSIONS.userBan },
    { method: 'POST', path: '/api/v1/admin/users/2/unban', permission: PERMISSIONS.userUnban },
    { method: 'POST', path: '/api/v1/admin/staff/invitations', permission: PERMISSIONS.staffCreate },
    { method: 'GET', path: '/api/v1/admin/staff', permission: PERMISSIONS.staffRead },
    { method: 'GET', path: '/api/v1/admin/staff/2', permission: PERMISSIONS.staffRead },
    { method: 'POST', path: '/api/v1/admin/staff/2/disable', permission: PERMISSIONS.staffDisable },
    { method: 'POST', path: '/api/v1/admin/staff/2/enable', permission: PERMISSIONS.staffEnable },
    { method: 'POST', path: '/api/v1/admin/staff/2/roles/UserAdmin', permission: PERMISSIONS.staffRoleGrant },
    { method: 'DELETE', path: '/api/v1/admin/staff/2/roles/UserAdmin', permission: PERMISSIONS.staffRoleRevoke },
    { method: 'GET', path: '/api/v1/admin/staff/2/sessions', permission: PERMISSIONS.staffRead },
    { method: 'DELETE', path: '/api/v1/admin/staff/2/sessions/00000000-0000-4000-8000-000000000002', permission: PERMISSIONS.staffSessionRevoke },
    { method: 'GET', path: '/api/v1/admin/tags', permission: PERMISSIONS.tagRead },
    { method: 'POST', path: '/api/v1/admin/tags', permission: PERMISSIONS.tagCreate },
    { method: 'PATCH', path: '/api/v1/admin/tags/1', permission: PERMISSIONS.tagUpdate },
    { method: 'POST', path: '/api/v1/admin/tags/1/deprecate', permission: PERMISSIONS.tagDeprecate },
    { method: 'POST', path: '/api/v1/admin/tags/1/restore', permission: PERMISSIONS.tagDeprecate },
    { method: 'POST', path: '/api/v1/admin/tags/1/merge', permission: PERMISSIONS.tagMerge },
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
    let defaultDenyControllerCalls = 0;
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
        const sessions = new TestSessionRepository();
        configureAuthSessionRepository(sessions);

        const endpointHandler: RequestHandler = (_req, res) => {
            controllerCalls += 1;
            res.status(204).end();
        };
        const app = express();

        app.use(cookieParser());
        const adminRouter = express.Router();

        adminRouter.use(requireStaffAuth, EnforceAuthorizationPolicies([
            ...adminAuthorizationPolicies,
            { method: 'get', path: '/default-deny/declared', permission: PERMISSIONS.userRead },
            {
                method: 'get',
                path: '/default-deny/unknown-permission',
                permission: 'unknown.permission' as PermissionCode
            }
        ]));
        adminRouter.use('/audit-logs', createAdminAuditLogsRouter({ list: endpointHandler }));
        adminRouter.use('/comments', createAdminCommentsRouter({
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
        adminRouter.use('/recipes', createAdminRecipesRouter({
            listPendingRecipes: endpointHandler,
            countPendingRecipes: endpointHandler,
            getRecipeAdmin: endpointHandler,
            approveRecipe: endpointHandler,
            rejectRecipe: endpointHandler,
            archiveRecipe: endpointHandler,
            deleteRecipe: endpointHandler
        }));
        adminRouter.use('/users', createAdminUsersRouter({
            listBannedUsers: endpointHandler,
            countBannedUsers: endpointHandler,
            getUserProfile: endpointHandler,
            banUser: endpointHandler,
            unbanUser: endpointHandler
        }));
        adminRouter.use('/staff/invitations', createStaffInvitationsRouter({
            create: endpointHandler
        }));
        adminRouter.use('/staff', createAdminStaffRouter({
            list: endpointHandler,
            get: endpointHandler,
            disable: endpointHandler,
            enable: endpointHandler,
            grantRole: endpointHandler,
            revokeRole: endpointHandler
        }));
        adminRouter.use('/staff', createAdminStaffSessionsRouter({
            listOwn: endpointHandler,
            revokeOwn: endpointHandler,
            listManaged: endpointHandler,
            revokeManaged: endpointHandler
        }));
        adminRouter.use('/tags', createAdminTagsRouter({
            list: endpointHandler,
            create: endpointHandler,
            update: endpointHandler,
            deprecate: endpointHandler,
            restore: endpointHandler,
            merge: endpointHandler
        }));
        const defaultDenyHandler: RequestHandler = (_req, res) => {
            defaultDenyControllerCalls += 1;
            res.status(204).end();
        };

        adminRouter.get('/default-deny/declared', defaultDenyHandler);
        adminRouter.get('/default-deny/forgotten', defaultDenyHandler);
        adminRouter.get('/default-deny/unknown-permission', defaultDenyHandler);
        app.use('/api/v1/admin', adminRouter);
        app.use('/api/v1/health', createHealthRouter({
            live: endpointHandler,
            ready: endpointHandler,
            health: endpointHandler
        }));
        app.use(errorHandler);

        cookie = await sessions.issueCookie(staff, 'admin');
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

    it('keeps recipe moderation permissions isolated by action', async () => {
        const recipeModerationPolicies = [
            { method: 'GET', path: '/api/v1/admin/recipes/pending', permission: PERMISSIONS.recipeReview },
            { method: 'POST', path: '/api/v1/admin/recipes/1/approve', permission: PERMISSIONS.recipePublish },
            { method: 'POST', path: '/api/v1/admin/recipes/1/reject', permission: PERMISSIONS.recipeReject },
            { method: 'POST', path: '/api/v1/admin/recipes/1/archive', permission: PERMISSIONS.recipeArchive }
        ] as const;
        const recipeModerationPermissions = recipeModerationPolicies.map(({ permission }) => permission);

        for (const policy of recipeModerationPolicies) {
            grantedPermissions = recipeModerationPermissions.filter((permission) => permission !== policy.permission);
            const controllerCallsBeforeRequest = controllerCalls;
            const response = await fetch(`${server.baseUrl}${policy.path}`, {
                method: policy.method,
                headers: { cookie }
            });

            assert.equal(response.status, 403, `${policy.method} ${policy.path} must reject other recipe permissions`);
            assert.equal(
                (await response.json() as { error: { code: string } }).error.code,
                'AUTH_PERMISSION_REQUIRED'
            );
            assert.equal(controllerCalls, controllerCallsBeforeRequest);
        }
    });

    it('keeps comment moderation permissions isolated by action', async () => {
        const commentModerationPolicies = [
            { method: 'GET', path: '/api/v1/admin/comments/moderated', permission: PERMISSIONS.commentReview },
            { method: 'POST', path: '/api/v1/admin/comments/1/hide', permission: PERMISSIONS.commentHide },
            { method: 'POST', path: '/api/v1/admin/comments/1/unmoderate', permission: PERMISSIONS.commentRestore },
            { method: 'POST', path: '/api/v1/admin/comments/1/restore', permission: PERMISSIONS.commentRestore }
        ] as const;
        const commentModerationPermissions = [
            PERMISSIONS.commentReview,
            PERMISSIONS.commentHide,
            PERMISSIONS.commentRestore
        ];

        for (const policy of commentModerationPolicies) {
            grantedPermissions = commentModerationPermissions.filter((permission) => permission !== policy.permission);
            const controllerCallsBeforeRequest = controllerCalls;
            const response = await fetch(`${server.baseUrl}${policy.path}`, {
                method: policy.method,
                headers: { cookie }
            });

            assert.equal(response.status, 403, `${policy.method} ${policy.path} must reject other comment permissions`);
            assert.equal(
                (await response.json() as { error: { code: string } }).error.code,
                'AUTH_PERMISSION_REQUIRED'
            );
            assert.equal(controllerCalls, controllerCallsBeforeRequest);
        }
    });

    it('keeps user management permissions isolated by action', async () => {
        const userManagementPolicies = [
            { method: 'GET', path: '/api/v1/admin/users/banned', permission: PERMISSIONS.userRead },
            { method: 'POST', path: '/api/v1/admin/users/2/ban', permission: PERMISSIONS.userBan },
            { method: 'POST', path: '/api/v1/admin/users/2/unban', permission: PERMISSIONS.userUnban }
        ] as const;
        const userManagementPermissions = userManagementPolicies.map(({ permission }) => permission);

        for (const policy of userManagementPolicies) {
            grantedPermissions = userManagementPermissions.filter((permission) => permission !== policy.permission);
            const controllerCallsBeforeRequest = controllerCalls;
            const response = await fetch(`${server.baseUrl}${policy.path}`, {
                method: policy.method,
                headers: { cookie }
            });

            assert.equal(response.status, 403, `${policy.method} ${policy.path} must reject other user permissions`);
            assert.equal(
                (await response.json() as { error: { code: string } }).error.code,
                'AUTH_PERMISSION_REQUIRED'
            );
            assert.equal(controllerCalls, controllerCallsBeforeRequest);
        }
    });

    it('keeps tag catalog permissions isolated by action', async () => {
        const tagPolicies = [
            { method: 'GET', path: '/api/v1/admin/tags', permission: PERMISSIONS.tagRead },
            { method: 'POST', path: '/api/v1/admin/tags', permission: PERMISSIONS.tagCreate },
            { method: 'PATCH', path: '/api/v1/admin/tags/1', permission: PERMISSIONS.tagUpdate },
            { method: 'POST', path: '/api/v1/admin/tags/1/deprecate', permission: PERMISSIONS.tagDeprecate },
            { method: 'POST', path: '/api/v1/admin/tags/1/restore', permission: PERMISSIONS.tagDeprecate },
            { method: 'POST', path: '/api/v1/admin/tags/1/merge', permission: PERMISSIONS.tagMerge }
        ] as const;
        const tagPermissions = [
            PERMISSIONS.tagRead,
            PERMISSIONS.tagCreate,
            PERMISSIONS.tagUpdate,
            PERMISSIONS.tagDeprecate,
            PERMISSIONS.tagMerge
        ];

        for (const policy of tagPolicies) {
            grantedPermissions = tagPermissions.filter((permission) => permission !== policy.permission);
            const controllerCallsBeforeRequest = controllerCalls;
            const response = await fetch(`${server.baseUrl}${policy.path}`, {
                method: policy.method,
                headers: { cookie }
            });

            assert.equal(response.status, 403, `${policy.method} ${policy.path} must reject other tag permissions`);
            assert.equal(
                (await response.json() as { error: { code: string } }).error.code,
                'AUTH_PERMISSION_REQUIRED'
            );
            assert.equal(controllerCalls, controllerCallsBeforeRequest);
        }
    });

    it('denies and logs a registered administrative endpoint with no declared policy', async () => {
        grantedPermissions = [...Object.values(PERMISSIONS)];
        const warnings: Array<{ message: string; meta?: unknown }> = [];
        const originalWarn = logger.warn;
        logger.warn = (message, meta) => warnings.push({ message, meta });

        try {
            const declared = await fetch(`${server.baseUrl}/api/v1/admin/default-deny/declared`, {
                headers: { cookie }
            });
            assert.equal(declared.status, 204);
            assert.equal(defaultDenyControllerCalls, 1);

            const forgotten = await fetch(`${server.baseUrl}/api/v1/admin/default-deny/forgotten`, {
                headers: { cookie }
            });

            assert.equal(forgotten.status, 403);
            assert.deepEqual(await forgotten.json(), {
                error: {
                    message: 'Administrative authorization policy is required',
                    code: 'AUTH_POLICY_REQUIRED'
                }
            });
            assert.equal(defaultDenyControllerCalls, 1);
        } finally {
            logger.warn = originalWarn;
        }

        assert.deepEqual(warnings, [{
            message: '[authz] Administrative request denied',
            meta: {
                code: 'AUTH_POLICY_REQUIRED',
                method: 'GET',
                path: '/api/v1/admin/default-deny/forgotten',
                permission: undefined,
                reason: 'policy_missing',
                userId: staff.id
            }
        }]);
    });

    it('exposes no audit modification or deletion endpoint to staff with audit.read', async () => {
        grantedPermissions = [PERMISSIONS.auditRead];
        const warnings: Array<{ message: string; meta?: unknown }> = [];
        const originalWarn = logger.warn;
        logger.warn = (message, meta) => warnings.push({ message, meta });

        try {
            for (const method of ['DELETE', 'PATCH', 'POST', 'PUT']) {
                const response = await fetch(`${server.baseUrl}/api/v1/admin/audit-logs/1`, {
                    method,
                    headers: { cookie }
                });

                assert.equal(response.status, 403, `${method} must not be exposed for administrative audit records`);
                assert.deepEqual(await response.json(), {
                    error: {
                        message: 'Administrative authorization policy is required',
                        code: 'AUTH_POLICY_REQUIRED'
                    }
                });
            }
        } finally {
            logger.warn = originalWarn;
        }

        assert.deepEqual(
            warnings.map(({ message, meta }) => ({
                message,
                code: (meta as { code?: string }).code,
                path: (meta as { path?: string }).path,
                reason: (meta as { reason?: string }).reason,
                userId: (meta as { userId?: number }).userId
            })),
            Array.from({ length: 4 }, () => ({
                message: '[authz] Administrative request denied',
                code: 'AUTH_POLICY_REQUIRED',
                path: '/api/v1/admin/audit-logs/1',
                reason: 'policy_missing',
                userId: staff.id
            }))
        );
    });

    it('exposes no physical staff account deletion endpoint even with every permission', async () => {
        grantedPermissions = [...Object.values(PERMISSIONS)];
        const warnings: Array<{ message: string; meta?: unknown }> = [];
        const originalWarn = logger.warn;
        logger.warn = (message, meta) => warnings.push({ message, meta });

        try {
            const response = await fetch(`${server.baseUrl}/api/v1/admin/staff/2`, {
                method: 'DELETE',
                headers: { cookie }
            });

            assert.equal(response.status, 403);
            assert.deepEqual(await response.json(), {
                error: {
                    message: 'Administrative authorization policy is required',
                    code: 'AUTH_POLICY_REQUIRED'
                }
            });
        } finally {
            logger.warn = originalWarn;
        }

        assert.deepEqual(warnings.map(({ message, meta }) => ({
            message,
            code: (meta as { code?: string }).code,
            method: (meta as { method?: string }).method,
            path: (meta as { path?: string }).path,
            reason: (meta as { reason?: string }).reason,
            userId: (meta as { userId?: number }).userId
        })), [{
            message: '[authz] Administrative request denied',
            code: 'AUTH_POLICY_REQUIRED',
            method: 'DELETE',
            path: '/api/v1/admin/staff/2',
            reason: 'policy_missing',
            userId: staff.id
        }]);
    });

    it('exposes no autonomous MFA reset endpoint from the back-office', async () => {
        grantedPermissions = [...Object.values(PERMISSIONS)];
        const warnings: Array<{ message: string; meta?: unknown }> = [];
        const originalWarn = logger.warn;
        logger.warn = (message, meta) => warnings.push({ message, meta });
        const controllerCallsBeforeRequest = controllerCalls;

        try {
            const response = await fetch(`${server.baseUrl}/api/v1/admin/staff/${staff.id}/mfa/reset`, {
                method: 'POST',
                headers: { cookie }
            });

            assert.equal(response.status, 403);
            assert.deepEqual(await response.json(), {
                error: {
                    message: 'Administrative authorization policy is required',
                    code: 'AUTH_POLICY_REQUIRED'
                }
            });
            assert.equal(controllerCalls, controllerCallsBeforeRequest);
        } finally {
            logger.warn = originalWarn;
        }

        assert.deepEqual(warnings.map(({ message, meta }) => ({
            message,
            code: (meta as { code?: string }).code,
            method: (meta as { method?: string }).method,
            path: (meta as { path?: string }).path,
            reason: (meta as { reason?: string }).reason,
            userId: (meta as { userId?: number }).userId
        })), [{
            message: '[authz] Administrative request denied',
            code: 'AUTH_POLICY_REQUIRED',
            method: 'POST',
            path: `/api/v1/admin/staff/${staff.id}/mfa/reset`,
            reason: 'policy_missing',
            userId: staff.id
        }]);
    });

    it('denies and logs a policy that references an unknown permission', async () => {
        grantedPermissions = ['unknown.permission' as PermissionCode];
        const warnings: Array<{ message: string; meta?: unknown }> = [];
        const originalWarn = logger.warn;
        logger.warn = (message, meta) => warnings.push({ message, meta });

        try {
            const response = await fetch(`${server.baseUrl}/api/v1/admin/default-deny/unknown-permission`, {
                headers: { cookie }
            });

            assert.equal(response.status, 403);
            assert.deepEqual(await response.json(), {
                error: {
                    message: 'Administrative authorization policy references an unknown permission',
                    code: 'AUTH_PERMISSION_UNKNOWN'
                }
            });
            assert.equal(defaultDenyControllerCalls, 1);
        } finally {
            logger.warn = originalWarn;
        }

        assert.deepEqual(warnings, [{
            message: '[authz] Administrative request denied',
            meta: {
                code: 'AUTH_PERMISSION_UNKNOWN',
                method: 'GET',
                path: '/api/v1/admin/default-deny/unknown-permission',
                permission: 'unknown.permission',
                reason: 'permission_unknown',
                userId: staff.id
            }
        }]);
    });
});
