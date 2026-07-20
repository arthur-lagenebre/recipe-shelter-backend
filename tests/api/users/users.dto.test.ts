import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    parseUpdateEmailBody,
    parseUpdatePasswordBody,
    parseUpdateUsernameBody,
    parseUsernameParam
} from '../../../src/api/users/users.dto.js';
import { HttpError } from '../../../src/utils/errors.js';

function assertHttpError(error: unknown, code: string, status: number): void {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
}

describe('users.dto', () => {
    it('parses an update email body', () => {
        assert.deepEqual(parseUpdateEmailBody({ newEmail: ' user@example.com ', currentPassword: 'secret' }), {
            newEmail: 'user@example.com',
            currentPassword: 'secret'
        });
    });

    it('rejects invalid update email bodies', () => {
        assert.throws(
            () => parseUpdateEmailBody(null),
            (error) => {
                assertHttpError(error, 'USERS_UPDATE_EMAIL_BAD_BODY', 400);
                return true;
            }
        );

        assert.throws(
            () => parseUpdateEmailBody({ currentPassword: 'secret' }),
            (error) => {
                assertHttpError(error, 'USERS_UPDATE_EMAIL_MISSING_EMAIL', 400);
                return true;
            }
        );

        assert.throws(
            () => parseUpdateEmailBody({ newEmail: 'user@example.com' }),
            (error) => {
                assertHttpError(error, 'USERS_UPDATE_EMAIL_MISSING_PASSWORD', 400);
                return true;
            }
        );
    });

    it('parses an update password body', () => {
        assert.deepEqual(parseUpdatePasswordBody({ currentPassword: 'old', newPassword: 'new-password' }), {
            currentPassword: 'old',
            newPassword: 'new-password'
        });
    });

    it('rejects invalid update password bodies', () => {
        assert.throws(
            () => parseUpdatePasswordBody(null),
            (error) => {
                assertHttpError(error, 'USERS_UPDATE_PASSWORD_BAD_BODY', 400);
                return true;
            }
        );

        assert.throws(
            () => parseUpdatePasswordBody({ newPassword: 'new-password' }),
            (error) => {
                assertHttpError(error, 'USERS_UPDATE_PASSWORD_MISSING_CURRENT', 400);
                return true;
            }
        );

        assert.throws(
            () => parseUpdatePasswordBody({ currentPassword: 'old' }),
            (error) => {
                assertHttpError(error, 'USERS_UPDATE_PASSWORD_MISSING_NEW', 400);
                return true;
            }
        );
    });

    it('parses an update username body', () => {
        assert.deepEqual(parseUpdateUsernameBody({ newUsername: ' testuser ', currentPassword: 'secret' }), {
            newUsername: 'testuser',
            currentPassword: 'secret'
        });
    });

    it('rejects invalid update username bodies', () => {
        assert.throws(
            () => parseUpdateUsernameBody(null),
            (error) => {
                assertHttpError(error, 'USERS_UPDATE_USERNAME_BAD_BODY', 400);
                return true;
            }
        );

        assert.throws(
            () => parseUpdateUsernameBody({ currentPassword: 'secret' }),
            (error) => {
                assertHttpError(error, 'USERS_UPDATE_USERNAME_MISSING_USERNAME', 400);
                return true;
            }
        );

        assert.throws(
            () => parseUpdateUsernameBody({ newUsername: 'testuser' }),
            (error) => {
                assertHttpError(error, 'USERS_UPDATE_USERNAME_MISSING_PASSWORD', 400);
                return true;
            }
        );
    });

    it('parses and validates username params', () => {
        assert.equal(parseUsernameParam(' testuser '), 'testuser');

        assert.throws(
            () => parseUsernameParam(' '),
            (error) => {
                assertHttpError(error, 'USERS_MISSING_USERNAME', 400);
                return true;
            }
        );
    });
});
