import { env } from '../../utils/env.js';
import { decryptStaffMfaSecret, verifyTotpCode } from '../../utils/security/staff-mfa.js';

import type { UserRepository } from '../../repositories/users/user.repository.interface.js';

export type StaffMfaVerification = 'verified' | 'not_enrolled' | 'invalid';

export interface StaffMfaVerifier {
  verify(userId: number, code: string): Promise<StaffMfaVerification>;
}

export class StaffMfaService implements StaffMfaVerifier {
  constructor(private readonly users: Pick<UserRepository, 'findStaffProfileByUserId'>) { }

  async verify(userId: number, code: string): Promise<StaffMfaVerification> {
    const profile = await this.users.findStaffProfileByUserId(userId);

    if (!profile?.mfaEnabledAt || !profile.mfaSecretEncrypted)
      return 'not_enrolled';

    const secret = decryptStaffMfaSecret(profile.mfaSecretEncrypted, env.auth.staffMfaEncryptionKey);

    return verifyTotpCode(secret, code) ? 'verified' : 'invalid';
  }
}
