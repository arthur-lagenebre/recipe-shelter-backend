import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { generateResetToken, hashResetToken } from '../../../src/utils/security/password-reset-token.js';

describe('password-reset-token', () => {
    it('generates 32-byte hex tokens', () => {
        const token = generateResetToken();

        assert.match(token, /^[a-f0-9]{64}$/);
    });

    it('hashes tokens deterministically without exposing the raw token', () => {
        const hash = hashResetToken('raw-token');

        assert.match(hash, /^[a-f0-9]{64}$/);
        assert.equal(hash, hashResetToken('raw-token'));
        assert.notEqual(hash, 'raw-token');
    });
});
