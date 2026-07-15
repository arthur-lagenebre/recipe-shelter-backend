import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PERMISSIONS } from '../../../src/security/permissions.js';
import {
    hasPermission,
    requireCommunityAccount,
    requirePermission,
    requireStaffAccount
} from '../../../src/services/auth/authorization.service.js';
import { HttpError } from '../../../src/utils/errors.js';

import type { AuthContext } from '../../../src/api/auth/auth.types.js';
import type { RequestHandler } from 'express';

const communityAuth: AuthContext = {
    userId: 2,
    username: 'community-user',
    accountType: 'community',
    status: 'active',
    permissions: []
};

const staffAuth: AuthContext = {
    userId: 1,
    username: 'staff-user',
    accountType: 'staff',
    status: 'active',
    permissions: [PERMISSIONS.usersRead, PERMISSIONS.usersModerate]
};

function runGuard(middleware: RequestHandler, auth?: AuthContext): { error: unknown; nextCalls: number } {
    let error: unknown;
    let nextCalls = 0;

    middleware({ auth } as never, null as never, (nextError?: unknown) => {
        error = nextError;
        nextCalls += 1;
    });

    return { error, nextCalls };
}

function assertForbidden(result: ReturnType<typeof runGuard>, code: string): void {
    assert.equal(result.nextCalls, 1);
    assert.ok(result.error instanceof HttpError);
    assert.equal(result.error.statusCode, 403);
    assert.equal(result.error.code, code);
}

describe('authorization service', () => {
    describe('hasPermission', () => {
        it('allows an active staff account with the exact effective permission', () => {
            assert.equal(hasPermission(staffAuth, PERMISSIONS.usersModerate), true);
        });

        it('denies absent, inactive, community, and underprivileged contexts by default', () => {
            assert.equal(hasPermission(undefined, PERMISSIONS.usersModerate), false);
            assert.equal(hasPermission({ ...staffAuth, status: 'locked' }, PERMISSIONS.usersModerate), false);
            assert.equal(hasPermission({ ...communityAuth, permissions: [PERMISSIONS.usersModerate] }, PERMISSIONS.usersModerate), false);
            assert.equal(hasPermission({ ...staffAuth, permissions: [PERMISSIONS.usersRead] }, PERMISSIONS.usersModerate), false);
        });
    });

    describe('requirePermission', () => {
        const middleware = requirePermission(PERMISSIONS.usersModerate);

        it('allows a staff account with the required effective permission', () => {
            assert.deepEqual(runGuard(middleware, staffAuth), { error: undefined, nextCalls: 1 });
        });

        it('denies missing authentication, forged community permissions, and missing staff permissions', () => {
            assertForbidden(runGuard(middleware), 'AUTH_PERMISSION_REQUIRED');
            assertForbidden(
                runGuard(middleware, { ...communityAuth, permissions: [PERMISSIONS.usersModerate] }),
                'AUTH_PERMISSION_REQUIRED'
            );
            assertForbidden(
                runGuard(middleware, { ...staffAuth, permissions: [PERMISSIONS.usersRead] }),
                'AUTH_PERMISSION_REQUIRED'
            );
        });
    });

    describe('requireCommunityAccount', () => {
        it('allows only active community accounts', () => {
            assert.deepEqual(runGuard(requireCommunityAccount, communityAuth), { error: undefined, nextCalls: 1 });
        });

        it('denies absent, inactive community, and staff contexts', () => {
            assertForbidden(runGuard(requireCommunityAccount), 'AUTH_COMMUNITY_ACCOUNT_REQUIRED');
            assertForbidden(
                runGuard(requireCommunityAccount, { ...communityAuth, status: 'inactive' }),
                'AUTH_COMMUNITY_ACCOUNT_REQUIRED'
            );
            assertForbidden(runGuard(requireCommunityAccount, staffAuth), 'AUTH_COMMUNITY_ACCOUNT_REQUIRED');
        });
    });

    describe('requireStaffAccount', () => {
        it('allows only active staff accounts', () => {
            assert.deepEqual(runGuard(requireStaffAccount, staffAuth), { error: undefined, nextCalls: 1 });
        });

        it('denies absent, inactive staff, and community contexts', () => {
            assertForbidden(runGuard(requireStaffAccount), 'AUTH_STAFF_ACCOUNT_REQUIRED');
            assertForbidden(
                runGuard(requireStaffAccount, { ...staffAuth, status: 'disabled' }),
                'AUTH_STAFF_ACCOUNT_REQUIRED'
            );
            assertForbidden(runGuard(requireStaffAccount, communityAuth), 'AUTH_STAFF_ACCOUNT_REQUIRED');
        });
    });
});
