import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { StaffMfaService } from '../../../src/services/auth/staff-mfa.service.js';
import { env } from '../../../src/utils/env.js';
import {
  decryptStaffMfaSecret,
  encryptStaffMfaSecret,
  verifyTotpCode
} from '../../../src/utils/security/staff-mfa.js';

import type { StaffProfile } from '../../../src/repositories/users/user.types.js';

const rfcTotpSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const testEncryptionKey = Buffer.alloc(32, 7).toString('base64');
const originalEncryptionKey = env.auth.staffMfaEncryptionKey;

afterEach(() => {
  env.auth.staffMfaEncryptionKey = originalEncryptionKey;
});

describe('staff MFA', () => {
  it('validates six-digit TOTP codes with a one-period clock tolerance', () => {
    assert.equal(verifyTotpCode(rfcTotpSecret, '287082', new Date(59_000), 0), true);
    assert.equal(verifyTotpCode(rfcTotpSecret, '287082', new Date(89_000), 1), true);
    assert.equal(verifyTotpCode(rfcTotpSecret, '287082', new Date(119_000), 1), false);
    assert.equal(verifyTotpCode(rfcTotpSecret, 'invalid', new Date(59_000)), false);
  });

  it('encrypts staff TOTP secrets with authenticated encryption', () => {
    const encrypted = encryptStaffMfaSecret(rfcTotpSecret, testEncryptionKey);

    assert.notEqual(encrypted.toString('utf8'), rfcTotpSecret);
    assert.equal(decryptStaffMfaSecret(encrypted, testEncryptionKey), rfcTotpSecret);

    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 1;
    assert.throws(() => decryptStaffMfaSecret(tampered, testEncryptionKey));
    assert.throws(() => encryptStaffMfaSecret(rfcTotpSecret, undefined), /AUTH_STAFF_MFA_ENCRYPTION_KEY/);
  });

  it('requires both enrollment state and a valid TOTP before verification succeeds', async () => {
    env.auth.staffMfaEncryptionKey = testEncryptionKey;
    let profile: StaffProfile | null = null;
    const service = new StaffMfaService({ async findStaffProfileByUserId() { return profile; } });

    assert.equal(await service.verify(1, '287082'), 'not_enrolled');

    profile = {
      userId: 1,
      status: 'active',
      mfaSecretEncrypted: encryptStaffMfaSecret(rfcTotpSecret, testEncryptionKey),
      mfaEnabledAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    assert.equal(await service.verify(1, '000000'), 'invalid');
  });
});
