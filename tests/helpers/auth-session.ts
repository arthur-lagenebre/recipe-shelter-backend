import { randomUUID } from 'node:crypto';

import { signSessionToken } from '../../src/services/auth/session-token.js';
import { adminSessionCookieName, appSessionCookieName } from '../../src/utils/session-cookie.js';

import type { CreateCommunitySessionInput, CreateStaffSessionInput, SessionRepository } from '../../src/repositories/auth/session.repository.interface.js';
import type { User } from '../../src/repositories/users/user.types.js';
import type { SessionRealm } from '../../src/utils/session-cookie.js';

export class TestSessionRepository implements SessionRepository {
  readonly communitySessions = new Map<string, CreateCommunitySessionInput>();
  readonly staffSessions = new Map<string, CreateStaffSessionInput>();

  async createCommunitySession(input: CreateCommunitySessionInput): Promise<void> {
    this.communitySessions.set(input.id, input);
  }

  async createStaffSession(input: CreateStaffSessionInput): Promise<void> {
    this.staffSessions.set(input.id, input);
  }

  async isCommunitySessionActive(id: string, userId: number): Promise<boolean> {
    const session = this.communitySessions.get(id);
    return Boolean(session?.userId === userId && session.expiresAt.getTime() > Date.now());
  }

  async isStaffSessionActive(id: string, userId: number): Promise<boolean> {
    const session = this.staffSessions.get(id);
    return Boolean(session?.userId === userId && Boolean(session.webAuthnCredentialId) && session.mfaVerifiedAt instanceof Date && session.expiresAt.getTime() > Date.now());
  }

  async revokeCommunitySession(id: string, userId: number): Promise<void> {
    if (this.communitySessions.get(id)?.userId === userId)
      this.communitySessions.delete(id);
  }

  async revokeStaffSession(id: string, userId: number): Promise<void> {
    if (this.staffSessions.get(id)?.userId === userId)
      this.staffSessions.delete(id);
  }

  async issueCookie(user: User, realm: SessionRealm): Promise<string> {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 60_000);

    if (realm === 'app')
      await this.createCommunitySession({ id, userId: user.id, expiresAt });
    else
      await this.createStaffSession({
        id,
        userId: user.id,
        expiresAt,
        webAuthnCredentialId: 'test-staff-credential',
        mfaVerifiedAt: new Date()
      });

    const token = signSessionToken(user, realm, id);
    const cookieName = realm === 'app' ? appSessionCookieName : adminSessionCookieName;
    return `${cookieName}=${token}`;
  }
}
