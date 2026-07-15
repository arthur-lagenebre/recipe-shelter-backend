import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RbacRepositoryMysql } from '../../../src/repositories/rbac/rbac.repository.mysql.js';
import { PERMISSIONS } from '../../../src/security/permissions.js';

import type { Pool } from 'mysql2/promise';

describe('RbacRepositoryMysql', () => {
    it('resolves distinct known permissions through both RBAC associations', async () => {
        let executedSql = '';
        let executedParams: unknown[] = [];
        const repository = new RbacRepositoryMysql({
            async execute(sql: string, params: unknown[]) {
                executedSql = sql;
                executedParams = params;
                return [[
                    { Code: PERMISSIONS.recipesRead },
                    { Code: PERMISSIONS.usersModerate },
                    { Code: 'unknown.permission' }
                ]];
            }
        } as unknown as Pool);

        const permissions = await repository.findPermissionCodesByStaffUserId(42);

        assert.deepEqual(permissions, [PERMISSIONS.recipesRead, PERMISSIONS.usersModerate]);
        assert.match(executedSql, /FROM StaffRoles AS sr/);
        assert.match(executedSql, /INNER JOIN RolePermissions AS rp/);
        assert.match(executedSql, /INNER JOIN Permissions AS p/);
        assert.deepEqual(executedParams, [42]);
    });
});
