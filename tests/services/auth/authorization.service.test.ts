import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PERMISSIONS } from '../../../src/security/permissions.js';
import { hasPermission, isCommunityAccount, isStaffAccount } from '../../../src/services/auth/authorization.service.js';

import type { AuthContext } from '../../../src/api/auth/auth.types.js';
import type { PermissionCode } from '../../../src/security/permissions.js';

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

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
    permissions: [PERMISSIONS.userRead, PERMISSIONS.userBan, PERMISSIONS.userUnban]
};

type AccessMatrixCase = Readonly<{
    name: string;
    auth: Readonly<AuthContext>;
    allowedPermissions: readonly PermissionCode[];
}>;

function createStaffAuth(userId: number, username: string, permissions: readonly PermissionCode[], status: AuthContext['status'] = 'active'): AuthContext {
    return {
        userId,
        username,
        accountType: 'staff',
        status,
        permissions: [...permissions]
    };
}

const ROLE_PERMISSIONS = {
    RecipeModerator: [PERMISSIONS.recipeReview, PERMISSIONS.recipePublish, PERMISSIONS.recipeReject, PERMISSIONS.recipeArchive],
    CommentModerator: [PERMISSIONS.commentReview, PERMISSIONS.commentHide, PERMISSIONS.commentRestore, PERMISSIONS.commentsUpdate],
    UserAdmin: [PERMISSIONS.userRead, PERMISSIONS.userBan, PERMISSIONS.userUnban],
    CatalogManager: [
        PERMISSIONS.catalogRead,
        PERMISSIONS.catalogManage,
        PERMISSIONS.tagRead,
        PERMISSIONS.tagCreate,
        PERMISSIONS.tagUpdate,
        PERMISSIONS.tagDeprecate,
        PERMISSIONS.tagMerge,
        PERMISSIONS.ingredientRead,
        PERMISSIONS.ingredientCreate,
        PERMISSIONS.ingredientUpdate,
        PERMISSIONS.ingredientDeprecate,
        PERMISSIONS.ingredientMerge,
        PERMISSIONS.ingredientAliasManage
    ],
    SuperAdmin: ALL_PERMISSIONS
} as const satisfies Record<string, readonly PermissionCode[]>;

const ACCESS_MATRIX: readonly AccessMatrixCase[] = [
    {
        name: 'community',
        auth: { ...communityAuth, permissions: [...ALL_PERMISSIONS] },
        allowedPermissions: []
    },
    {
        name: 'staff without role',
        auth: createStaffAuth(3, 'staff-without-role', []),
        allowedPermissions: []
    },
    {
        name: 'RecipeModerator',
        auth: createStaffAuth(4, 'recipe-moderator', ROLE_PERMISSIONS.RecipeModerator),
        allowedPermissions: ROLE_PERMISSIONS.RecipeModerator
    },
    {
        name: 'CommentModerator',
        auth: createStaffAuth(5, 'comment-moderator', ROLE_PERMISSIONS.CommentModerator),
        allowedPermissions: ROLE_PERMISSIONS.CommentModerator
    },
    {
        name: 'UserAdmin',
        auth: createStaffAuth(6, 'user-admin', ROLE_PERMISSIONS.UserAdmin),
        allowedPermissions: ROLE_PERMISSIONS.UserAdmin
    },
    {
        name: 'CatalogManager',
        auth: createStaffAuth(7, 'catalog-manager', ROLE_PERMISSIONS.CatalogManager),
        allowedPermissions: ROLE_PERMISSIONS.CatalogManager
    },
    {
        name: 'SuperAdmin',
        auth: createStaffAuth(8, 'super-admin', ROLE_PERMISSIONS.SuperAdmin),
        allowedPermissions: ROLE_PERMISSIONS.SuperAdmin
    },
    {
        name: 'disabled staff',
        auth: createStaffAuth(9, 'disabled-staff', ALL_PERMISSIONS, 'disabled'),
        allowedPermissions: []
    }
];

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
        it('enforces the complete access matrix for every account and role', () => {
            for (const matrixCase of ACCESS_MATRIX) {
                const expectedPermissions = new Set(matrixCase.allowedPermissions);
                const allowedPermissions = ALL_PERMISSIONS.filter((permission) => hasPermission(matrixCase.auth, permission));
                const deniedPermissions = ALL_PERMISSIONS.filter((permission) => !hasPermission(matrixCase.auth, permission));

                assert.deepEqual(allowedPermissions, matrixCase.allowedPermissions, `${matrixCase.name} must receive exactly its declared permissions`);
                assert.deepEqual(deniedPermissions, ALL_PERMISSIONS.filter((permission) => !expectedPermissions.has(permission)), `${matrixCase.name} must be denied every other permission`);
            }
        });

        it('denies absent and unknown authorization inputs by default', () => {
            assert.equal(hasPermission(undefined, PERMISSIONS.userBan), false);
            assert.equal(hasPermission(staffAuth, 'unknown.permission' as never), false);
        });
    });
});
