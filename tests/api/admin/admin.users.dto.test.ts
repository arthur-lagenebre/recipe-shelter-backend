import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseAdminUserIdParam, parseBanUserBody, parseUnbanUserBody } from '../../../src/api/admin/admin.users.dto.js';
import { HttpError } from '../../../src/utils/errors.js';

function assertHttpError(error: unknown, code: string, status: number): void {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
}

describe('admin.users.dto', () => {
    it('parses a user id param', () => {
        assert.equal(parseAdminUserIdParam('12'), 12);
    });

    it('rejects an invalid user id param', () => {
        assert.throws(
            () => parseAdminUserIdParam('abc'),
            (error) => {
                assertHttpError(error, 'ADMIN_USERS_BAD_ID', 400);

                return true;
            }
        );
    });

    it('parses and trims a ban body', () => {
        const result = parseBanUserBody({reason: '  Repeated abuse of the platform rules.  '});

        assert.equal(result, 'Repeated abuse of the platform rules.');
    });

    it('rejects a short ban reason', () => {
        assert.throws(
            () => parseBanUserBody({reason: 'too short'}),
            (error) => {
                assertHttpError(error, 'ADMIN_USERS_BAN_REASON_TOO_SHORT', 400);

                return true;
            }
        );
    });

    it('parses and trims an unban body', () => {
        const result = parseUnbanUserBody({reason: '  Appeal accepted after review.  '});

        assert.equal(result, 'Appeal accepted after review.');
    });

    it('rejects a missing unban reason', () => {
        assert.throws(
            () => parseUnbanUserBody({}),
            (error) => {
                assertHttpError(error, 'ADMIN_USERS_UNBAN_MISSING_REASON', 400);

                return true;
            }
        );
    });

    it('rejects a too long unban reason', () => {
        assert.throws(
            () => parseUnbanUserBody({reason: 'x'.repeat(1001)}),
            (error) => {
                assertHttpError(error, 'ADMIN_USERS_UNBAN_REASON_TOO_LONG', 400);

                return true;
            }
        );
    });
});
