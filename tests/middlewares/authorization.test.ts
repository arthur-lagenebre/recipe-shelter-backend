import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    CommunityOnly,
    RequirePermission,
    StaffOnly
} from '../../src/middlewares/authorization.js';
import { PERMISSIONS } from '../../src/security/permissions.js';
import { HttpError } from '../../src/utils/errors.js';

import type { AuthContext } from '../../src/api/auth/auth.types.js';
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

describe('authorization middlewares', () => {
    describe('CommunityOnly', () => {
        it('allows an active community account', () => {
            assert.deepEqual(runGuard(CommunityOnly, communityAuth), { error: undefined, nextCalls: 1 });
        });

        it('denies absent, inactive community, and staff contexts', () => {
            assertForbidden(runGuard(CommunityOnly), 'AUTH_COMMUNITY_ACCOUNT_REQUIRED');
            assertForbidden(
                runGuard(CommunityOnly, { ...communityAuth, status: 'inactive' }),
                'AUTH_COMMUNITY_ACCOUNT_REQUIRED'
            );
            assertForbidden(runGuard(CommunityOnly, staffAuth), 'AUTH_COMMUNITY_ACCOUNT_REQUIRED');
        });
    });

    describe('StaffOnly', () => {
        it('allows an active staff account', () => {
            assert.deepEqual(runGuard(StaffOnly, staffAuth), { error: undefined, nextCalls: 1 });
        });

        it('denies absent, inactive staff, and community contexts', () => {
            assertForbidden(runGuard(StaffOnly), 'AUTH_STAFF_ACCOUNT_REQUIRED');
            assertForbidden(
                runGuard(StaffOnly, { ...staffAuth, status: 'disabled' }),
                'AUTH_STAFF_ACCOUNT_REQUIRED'
            );
            assertForbidden(runGuard(StaffOnly, communityAuth), 'AUTH_STAFF_ACCOUNT_REQUIRED');
        });
    });

    describe('RequirePermission', () => {
        const middleware = RequirePermission(PERMISSIONS.usersModerate);

        it('allows active staff with the exact effective permission', () => {
            assert.deepEqual(runGuard(middleware, staffAuth), { error: undefined, nextCalls: 1 });
        });

        it('denies absent, inactive, forged community, and underprivileged staff contexts', () => {
            assertForbidden(runGuard(middleware), 'AUTH_PERMISSION_REQUIRED');
            assertForbidden(
                runGuard(middleware, { ...staffAuth, status: 'locked' }),
                'AUTH_PERMISSION_REQUIRED'
            );
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
});
