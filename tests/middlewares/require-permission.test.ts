import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { requirePermission } from '../../src/middlewares/require-permission.js';
import { PERMISSIONS } from '../../src/security/permissions.js';
import { HttpError } from '../../src/utils/errors.js';

describe('requirePermission', () => {
    const middleware = requirePermission(PERMISSIONS.usersModerate);

    it('allows a staff account with the required effective permission', () => {
        let called = false;

        middleware({
            auth: {
                userId: 1,
                username: 'admin',
                accountType: 'staff',
                status: 'active',
                permissions: [PERMISSIONS.usersRead, PERMISSIONS.usersModerate]
            }
        } as never, null as never, () => {
            called = true;
        });

        assert.equal(called, true);
    });

    it('denies missing authentication or missing permissions by default', () => {
        for (const request of [
            {},
            {
                auth: {
                    userId: 2,
                    username: 'staff',
                    accountType: 'staff',
                    status: 'active',
                    permissions: []
                }
            },
            {
                auth: {
                    userId: 3,
                    username: 'unbanner',
                    accountType: 'staff',
                    status: 'active',
                    permissions: [PERMISSIONS.usersRead]
                }
            }
        ]) {
            let nextError: unknown;
            middleware(request as never, null as never, (error: unknown) => {
                nextError = error;
            });

            assert.ok(nextError instanceof HttpError);
            assert.equal(nextError.code, 'AUTH_PERMISSION_REQUIRED');
            assert.equal(nextError.statusCode, 403);
        }
    });
});
