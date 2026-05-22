import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validatePassword } from '../../../src/services/auth/password-policy.js';

describe('password-policy', () => {
    it('accepts passwords within length boundaries', () => {
        assert.equal(validatePassword('12345678'), null);
        assert.equal(validatePassword('x'.repeat(128)), null);
    });

    it('rejects empty, short and too long passwords', () => {
        assert.equal(validatePassword(''), 'Password is required');
        assert.equal(validatePassword('1234567'), 'Password must be at least 8 characters');
        assert.equal(validatePassword('x'.repeat(129)), 'Password must be at most 128 characters');
    });
});
