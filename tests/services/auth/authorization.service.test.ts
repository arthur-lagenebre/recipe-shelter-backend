import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PERMISSIONS } from '../../../src/security/permissions.js';
import {
    hasPermission,
    isCommunityAccount,
    isStaffAccount
} from '../../../src/services/auth/authorization.service.js';

import type { AuthContext } from '../../../src/api/auth/auth.types.js';

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

describe('authorization service', () => {
    describe('account type decisions', () => {
        it('recognizes only active community accounts', () => {
            assert.equal(isCommunityAccount(communityAuth), true);
            assert.equal(isCommunityAccount(undefined), false);
            assert.equal(isCommunityAccount({ ...communityAuth, status: 'inactive' }), false);
            assert.equal(isCommunityAccount(staffAuth), false);
        });

        it('recognizes only active staff accounts', () => {
            assert.equal(isStaffAccount(staffAuth), true);
            assert.equal(isStaffAccount(undefined), false);
            assert.equal(isStaffAccount({ ...staffAuth, status: 'disabled' }), false);
            assert.equal(isStaffAccount(communityAuth), false);
        });
    });

    describe('hasPermission', () => {
        it('allows an active staff account with the exact effective permission', () => {
            assert.equal(hasPermission(staffAuth, PERMISSIONS.usersModerate), true);
        });

        it('denies absent, inactive, community, and underprivileged contexts by default', () => {
            assert.equal(hasPermission(undefined, PERMISSIONS.usersModerate), false);
            assert.equal(hasPermission({ ...staffAuth, status: 'locked' }, PERMISSIONS.usersModerate), false);
            assert.equal(hasPermission({ ...communityAuth, permissions: [PERMISSIONS.usersModerate] }, PERMISSIONS.usersModerate), false);
            assert.equal(hasPermission({ ...staffAuth, permissions: [PERMISSIONS.usersRead] }, PERMISSIONS.usersModerate), false);
            assert.equal(hasPermission(staffAuth, 'unknown.permission' as never), false);
        });
    });
});
