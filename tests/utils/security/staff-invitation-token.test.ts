import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { generateStaffInvitationToken, hashStaffInvitationToken } from '../../../src/utils/security/staff-invitation-token.js';

describe('staff invitation token', () => {
    it('generates unpredictable 256-bit opaque tokens', () => {
        const first = generateStaffInvitationToken();
        const second = generateStaffInvitationToken();

        assert.match(first, /^[a-f0-9]{64}$/);
        assert.match(second, /^[a-f0-9]{64}$/);
        assert.notEqual(first, second);
    });

    it('produces a deterministic SHA-256 hash without retaining the raw token', () => {
        const token = 'bootstrap-token';
        const hash = hashStaffInvitationToken(token);

        assert.equal(hash, 'c72773a4ddf81c3ad2b88ff62ca2fa99079515ec81f1df19d9c770b013b79a7b');
        assert.doesNotMatch(hash, new RegExp(token));
    });
});
