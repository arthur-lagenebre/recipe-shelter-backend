import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    parseAdminStaffRoleCodeParam,
    parseAdminStaffUserIdParam,
    parseStaffActionReasonBody
} from '../../../src/api/admin/admin.staff.dto.js';
import { HttpError } from '../../../src/utils/errors.js';

describe('admin staff DTO', () => {
    it('parses staff identifiers, stable role codes and trimmed reasons', () => {
        assert.equal(parseAdminStaffUserIdParam('42'), 42);
        assert.equal(parseAdminStaffRoleCodeParam(' RecipeModerator '), 'RecipeModerator');
        assert.equal(parseStaffActionReasonBody({ reason: '  Confirmed staff departure.  ' }, 'disable'), 'Confirmed staff departure.');
    });

    it('rejects malformed identifiers and role codes', () => {
        for (const value of ['', '0', '-1', '1.5', '9007199254740992'])
            assert.throws(
                () => parseAdminStaffUserIdParam(value),
                (error) => assertHttpError(error, 'ADMIN_STAFF_BAD_USER_ID')
            );

        for (const value of ['', 'bad role', '.hidden', 'x'.repeat(65)])
            assert.throws(
                () => parseAdminStaffRoleCodeParam(value),
                (error) => assertHttpError(error, 'ADMIN_STAFF_BAD_ROLE_CODE')
            );
    });

    it('requires a meaningful reason for every sensitive mutation', () => {
        for (const action of ['disable', 'enable', 'role_grant', 'role_revoke'] as const) {
            assert.throws(
                () => parseStaffActionReasonBody({}, action),
                (error) => assertHttpError(error, `STAFF_${action.toUpperCase()}_MISSING_REASON`)
            );
            assert.throws(
                () => parseStaffActionReasonBody({ reason: 'short' }, action),
                (error) => assertHttpError(error, `STAFF_${action.toUpperCase()}_REASON_TOO_SHORT`)
            );
            assert.throws(
                () => parseStaffActionReasonBody({ reason: 'x'.repeat(1001) }, action),
                (error) => assertHttpError(error, `STAFF_${action.toUpperCase()}_REASON_TOO_LONG`)
            );
        }
    });
});

function assertHttpError(error: unknown, code: string): boolean {
    assert.ok(error instanceof HttpError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, code);
    return true;
}
