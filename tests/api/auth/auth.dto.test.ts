import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseLoginBody, parseRegisterBody, parseResendValidationEmailBody, parseResetPasswordBody, parseValidateEmailBody } from '../../../src/api/auth/auth.dto.js';
import { HttpError } from '../../../src/utils/errors.js';

function assertHttpError(error: unknown, code: string, status: number): void {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
}

describe('auth.dto', () => {
    it('parses and normalizes a register body', () => {
        const result = parseRegisterBody({
            mail: ' USER@Example.COM ',
            username: ' testuser ',
            password: 'Recipe42?'
        });

        assert.deepEqual(result, {
            mail: 'user@example.com',
            username: 'testuser',
            password: 'Recipe42?'
        });
    });

    it('rejects a register body with missing fields', () => {
        assert.throws(
            () => parseRegisterBody({ mail: 'user@example.com', username: 'testuser' }),
            (error) => {
                assertHttpError(error, 'AUTH_MISSING_FIELDS', 400);

                return true;
            }
        );
    });

    it('rejects invalid register emails and weak credentials', () => {
        assert.throws(
            () => parseRegisterBody({ mail: 'user', username: 'testuser', password: 'Recipe42?' }),
            (error) => {
                assertHttpError(error, 'AUTH_INVALID_EMAIL', 400);

                return true;
            }
        );

        assert.throws(
            () => parseRegisterBody({ mail: 'user@example.com', username: 'te', password: 'Recipe42?' }),
            (error) => {
                assertHttpError(error, 'AUTH_WEAK_USERNAME', 400);

                return true;
            }
        );

        assert.throws(
            () => parseRegisterBody({ mail: 'user@example.com', username: 'testuser', password: 'short' }),
            (error) => {
                assertHttpError(error, 'AUTH_WEAK_PASSWORD', 400);

                return true;
            }
        );
    });

    it('parses a login body', () => {
        assert.deepEqual(parseLoginBody({ mail: ' USER@Example.COM ', password: 'Recipe42?' }), {
            mail: 'user@example.com',
            password: 'Recipe42?'
        });
    });

    it('rejects a login body with missing fields', () => {
        assert.throws(
            () => parseLoginBody({ mail: 'user@example.com' }),
            (error) => {
                assertHttpError(error, 'AUTH_MISSING_FIELDS', 400);

                return true;
            }
        );
    });

    it('parses and validates email validation tokens', () => {
        assert.deepEqual(parseValidateEmailBody({ token: ' token-123 ' }), { token: 'token-123' });

        assert.throws(
            () => parseValidateEmailBody({ token: ' ' }),
            (error) => {
                assertHttpError(error, 'AUTH_EMAIL_VALIDATION_MISSING_TOKEN', 400);

                return true;
            }
        );
    });

    it('parses a reset password body', () => {
        const result = parseResetPasswordBody({
            token: ' abc123 ',
            password: 'Recipe42?'
        });

        assert.deepEqual(result, {
            token: 'abc123',
            password: 'Recipe42?'
        });
    });

    it('accepts newPassword as a reset password alias', () => {
        const result = parseResetPasswordBody({
            token: 'abc123',
            newPassword: 'Recipe42?'
        });

        assert.deepEqual(result, {
            token: 'abc123',
            password: 'Recipe42?'
        });
    });

    it('rejects a reset password body without a token', () => {
        assert.throws(
            () => parseResetPasswordBody({
                password: 'Recipe42?'
            }),
            (error) => {
                assertHttpError(error, 'AUTH_RESET_PASSWORD_MISSING_TOKEN', 400);

                return true;
            }
        );
    });

    it('parses and validates resend validation email bodies', () => {
        assert.deepEqual(parseResendValidationEmailBody({ mail: ' USER@Example.COM ' }), {
            mail: 'user@example.com'
        });

        assert.throws(
            () => parseResendValidationEmailBody({ mail: '' }),
            (error) => {
                assertHttpError(error, 'AUTH_VALIDATION_RESEND_MISSING_EMAIL', 400);

                return true;
            }
        );

        assert.throws(
            () => parseResendValidationEmailBody({ mail: 'invalid' }),
            (error) => {
                assertHttpError(error, 'AUTH_INVALID_EMAIL', 400);

                return true;
            }
        );
    });
});
