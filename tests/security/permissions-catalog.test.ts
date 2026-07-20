import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { isPermissionCode, PERMISSIONS } from '../../src/security/permissions.js';

const schemaPath = new URL('../../database/migrations/1_create_schema.sql', import.meta.url);
const seedPath = new URL('../../database/seed.sql', import.meta.url);

const EXPECTED_ROLE_PERMISSIONS: Record<string, string[]> = {
    CatalogManager: [
        PERMISSIONS.catalogManage,
        PERMISSIONS.catalogRead
    ],
    CommentModerator: [
        PERMISSIONS.commentHide,
        PERMISSIONS.commentRestore,
        PERMISSIONS.commentReview,
        PERMISSIONS.commentsUpdate
    ],
    RecipeModerator: [
        PERMISSIONS.recipeArchive,
        PERMISSIONS.recipePublish,
        PERMISSIONS.recipeReject,
        PERMISSIONS.recipeReview
    ],
    SuperAdmin: [...Object.values(PERMISSIONS)].sort(),
    UserAdmin: [
        PERMISSIONS.usersModerate,
        PERMISSIONS.usersRead
    ]
};

describe('RBAC seed catalog', () => {
    it('keeps stable application permission codes synchronized with the central seed', async () => {
        const seed = await readFile(seedPath, 'utf8');
        const permissionInsert = seed.match(/INSERT INTO Permissions[\s\S]+?(?=AS new_permissions)/)?.[0];

        assert.ok(permissionInsert, 'The central seed must insert the permission catalog');
        const seededPermissions = [...permissionInsert.matchAll(/\(\d+,\s*'([^']+)',\s*"([^"\r\n]+)"\)/g)]
            .map((match) => ({ code: match[1], description: match[2] }));
        const seededCodes = seededPermissions.map(({ code }) => code);
        const applicationCodes = Object.values(PERMISSIONS);

        assert.deepEqual(seededCodes, applicationCodes);
        assert.ok(seededPermissions.every(({ description }) => description.trim().length > 0));
        assert.equal(new Set(applicationCodes).size, applicationCodes.length);
        assert.ok(applicationCodes.every((code) => /^[a-z]+(?:\.[a-z]+)+$/.test(code)));
        assert.deepEqual(
            [...new Set(applicationCodes.map((code) => code.split('.')[0]))].sort(),
            ['audit', 'catalog', 'comment', 'comments', 'recipe', 'recipes', 'staff', 'system', 'users']
        );
        assert.ok(applicationCodes.every((code) => isPermissionCode(code)));
        assert.equal(isPermissionCode('unknown.permission'), false);
        assert.equal(isPermissionCode(null), false);
        assert.deepEqual(
            applicationCodes.filter((code) => code.startsWith('audit.')),
            [PERMISSIONS.auditRead],
            'The audit domain must expose read access only'
        );
    });

    it('defines the validated role-permission matrix with no duplicate or unknown association', async () => {
        const seed = await readFile(seedPath, 'utf8');
        const rolePermissionInsert = seed.match(/INSERT INTO RolePermissions[\s\S]+?;/)?.[0];

        assert.ok(rolePermissionInsert, 'The central seed must insert the role-permission matrix');

        const associations = [...rolePermissionInsert.matchAll(
            /(?:SELECT|UNION ALL SELECT)\s+'([^']+)'(?:\s+AS RoleCode)?\s*,\s*'([^']+)'(?:\s+AS PermissionCode)?/g
        )].map((match) => ({ roleCode: match[1], permissionCode: match[2] }));
        const associationKeys = associations.map(({ roleCode, permissionCode }) => `${roleCode}:${permissionCode}`);
        const knownPermissionCodes = new Set<string>(Object.values(PERMISSIONS));
        const permissionsByRole: Record<string, string[]> = {};

        for (const { roleCode, permissionCode } of associations)
            (permissionsByRole[roleCode] ??= []).push(permissionCode);
        for (const permissionCodes of Object.values(permissionsByRole))
            permissionCodes.sort();

        assert.deepEqual(permissionsByRole, EXPECTED_ROLE_PERMISSIONS);
        assert.equal(new Set(associationKeys).size, associationKeys.length);
        assert.ok(associations.every(({ permissionCode }) => knownPermissionCodes.has(permissionCode)));
    });

    it('keeps all initial permissions out of the structural schema', async () => {
        const schema = await readFile(schemaPath, 'utf8');

        assert.doesNotMatch(schema, /INSERT\s+INTO\s+Permissions\b/i);
        assert.doesNotMatch(schema, /INSERT\s+INTO\s+RolePermissions\b/i);
    });
});
