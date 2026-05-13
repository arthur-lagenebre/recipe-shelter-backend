import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseResetPasswordBody } from '../../../src/api/auth/auth.dto.js';
import { HttpError } from '../../../src/utils/errors.js';

function assertHttpError(error: unknown, code: string, status: number): void {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
}

describe('auth.dto', () => {
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
});
