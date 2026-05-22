import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { requireAdmin } from '../../src/middlewares/require-admin.js';
import { HttpError } from '../../src/utils/errors.js';

describe('requireAdmin', () => {
    it('allows admin users', () => {
        let called = false;

        requireAdmin({ auth: { userId: 1, username: 'admin', roleId: 1 } } as never, null as never, () => {
            called = true;
        });

        assert.equal(called, true);
    });

    it('rejects non-admin users', () => {
        let nextError: unknown;

        requireAdmin({ auth: { userId: 2, username: 'user', roleId: 2 } } as never, null as never, (error) => {
            nextError = error;
        });

        assert.ok(nextError instanceof HttpError);
        assert.equal(nextError.code, 'ADMIN_ACCESS_REQUIRED');
        assert.equal(nextError.statusCode, 403);
    });
});
