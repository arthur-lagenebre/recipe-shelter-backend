import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCreateStaffInvitationBody } from '../../../src/api/admin/admin.staff-invitations.dto.js';
import { HttpError } from '../../../src/utils/errors.js';

describe('staff invitation DTO', () => {
    it('normalizes the email, display name and initial role codes', () => {
        assert.deepEqual(
            parseCreateStaffInvitationBody({
                email: ' Staff.Member@Example.COM ',
                displayName: ' Staff Member ',
                roles: [' RecipeModerator ', 'CommentModerator']
            }),
            {
                email: 'staff.member@example.com',
                displayName: 'Staff Member',
                roles: ['RecipeModerator', 'CommentModerator']
            }
        );
    });

    it('rejects malformed bodies and identities', () => {
        const cases: Array<{ body: unknown; code: string }> = [
            { body: null, code: 'STAFF_INVITATION_BAD_BODY' },
            { body: {}, code: 'STAFF_INVITATION_EMAIL_REQUIRED' },
            { body: { email: 'invalid', displayName: 'Staff', roles: ['UserAdmin'] }, code: 'STAFF_INVITATION_EMAIL_INVALID' },
            {
                body: { email: 'staff@example.com', displayName: '  ', roles: ['UserAdmin'] },
                code: 'STAFF_INVITATION_DISPLAY_NAME_REQUIRED'
            },
            {
                body: { email: 'staff@example.com', displayName: 'ab', roles: ['UserAdmin'] },
                code: 'STAFF_INVITATION_DISPLAY_NAME_TOO_SHORT'
            },
            {
                body: { email: 'staff@example.com', displayName: 'a'.repeat(65), roles: ['UserAdmin'] },
                code: 'STAFF_INVITATION_DISPLAY_NAME_TOO_LONG'
            }
        ];

        for (const testCase of cases)
            assert.throws(
                () => parseCreateStaffInvitationBody(testCase.body),
                (error) => assertHttpError(error, testCase.code)
            );
    });

    it('requires a bounded, non-empty and unique role code list', () => {
        const base = { email: 'staff@example.com', displayName: 'Staff Member' };
        const cases: Array<{ roles: unknown; code: string }> = [
            { roles: undefined, code: 'STAFF_INVITATION_ROLES_REQUIRED' },
            { roles: [], code: 'STAFF_INVITATION_ROLES_REQUIRED' },
            { roles: [42], code: 'STAFF_INVITATION_ROLES_INVALID' },
            { roles: [''], code: 'STAFF_INVITATION_ROLES_INVALID' },
            { roles: ['a'.repeat(65)], code: 'STAFF_INVITATION_ROLES_INVALID' },
            { roles: Array.from({ length: 21 }, (_, index) => `Role${index}`), code: 'STAFF_INVITATION_ROLES_INVALID' },
            { roles: ['UserAdmin', 'UserAdmin'], code: 'STAFF_INVITATION_ROLES_DUPLICATE' }
        ];

        for (const testCase of cases)
            assert.throws(
                () => parseCreateStaffInvitationBody({ ...base, roles: testCase.roles }),
                (error) => assertHttpError(error, testCase.code)
            );
    });
});

function assertHttpError(error: unknown, code: string): boolean {
    assert.ok(error instanceof HttpError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, code);
    return true;
}
