import { randomUUID } from 'node:crypto';

import bcrypt from 'bcrypt';

import { validatePassword } from './password-policy.js';
import { signSessionToken, verifySessionToken } from './session-token.js';
import { env } from '../../utils/env.js';
import { conflict, unauthorized, badRequest } from '../../utils/errors.js';
import { normalizeEmail } from '../../utils/string.js';

import type { EmailValidationService } from './email-validation.service.js';
import type { StaffMfaManager } from './staff-mfa.service.js';
import type { SessionRepository } from '../../repositories/auth/session.repository.interface.js';
import type { UserRepository } from '../../repositories/users/user.repository.interface.js';
import type { User, UserWithPassword } from '../../repositories/users/user.types.js';
import type { SessionRealm } from '../../utils/session-cookie.js';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly emailValidationService: EmailValidationService,
    private readonly sessions: SessionRepository,
    private readonly staffMfa: StaffMfaManager
  ) { }

  async register(input: { mail: string; username: string; password: string }): Promise<{ user: User; message: string }> {
    const mail = normalizeEmail(input.mail);
    const username = input.username.trim();
    const password = input.password;

    if (!mail || !username || !password)
      throw badRequest('Missing fields', 'AUTH_MISSING_FIELDS');

    const passwordError = validatePassword(password);
    if (passwordError)
      throw badRequest(passwordError, 'AUTH_WEAK_PASSWORD');

    if (await this.users.isEmailTaken(mail))
      throw conflict('Email already used', 'AUTH_EMAIL_TAKEN');

    if (username.length < 3)
      throw badRequest('Username too short', 'AUTH_WEAK_USERNAME');
    if (await this.users.isUsernameTaken(username))
      throw conflict('Username already used', 'AUTH_USERNAME_TAKEN');

    const passwordHash = await bcrypt.hash(password, env.auth.bcryptCost);
    const user = await this.users.create({ mail, username, passwordHash, accountType: 'community', status: 'inactive' });
    await this.emailValidationService.sendValidationEmailForUser(user);

    return { user, message: 'Account created. Please validate your email before signing in.' };
  }

  async loginCommunity(input: { mail: string; password: string }): Promise<{ user: User; token: string }> {
    const authUser = await this.authenticatePassword(input);

    if (authUser.accountType !== 'community')
      throw unauthorized('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');
    if (authUser.status === 'inactive')
      throw unauthorized('Email is not validated', 'EMAIL_NOT_VALIDATED');
    if (authUser.status === 'banned')
      throw unauthorized('User is banned', 'USER_BANNED');

    const user = this.withoutPassword(authUser);
    const token = await this.createSession(user, 'app');

    return { user, token };
  }

  async beginStaffLogin(input: { mail: string; password: string }) {
    const authUser = await this.authenticatePassword(input);

    this.assertStaffCanAuthenticate(authUser);

    return this.staffMfa.beginAuthentication(authUser.id);
  }

  async completeStaffLogin(input: { flowId: string; credential: AuthenticationResponseJSON; ipAddress: string | null; userAgent: string | null; }): Promise<{ user: User; token: string }> {
    const mfa = await this.staffMfa.completeAuthentication(input.flowId, input.credential);
    const user = await this.users.findById(mfa.staffUserId);

    if (!user || user.accountType !== 'staff')
      throw unauthorized('Invalid MFA assertion', 'AUTH_INVALID_MFA_ASSERTION');

    this.assertStaffCanAuthenticate(user);
    const token = await this.createSession(user, 'admin', {
      ...mfa,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    });

    return { user, token };
  }

  async beginStaffMfaEnrollment(invitationToken: string) {
    return this.staffMfa.beginEnrollment(invitationToken);
  }

  async activateStaffInvitation(input: { flowId: string; invitationToken: string; password: string; credential: RegistrationResponseJSON; }) {
    return this.staffMfa.completeEnrollment(input);
  }

  async logout(token: string | null, realm: SessionRealm): Promise<void> {
    if (!token)
      return;

    let session;
    try {
      session = verifySessionToken(token, realm, true);
    } catch {
      return;
    }

    if (!session)
      return;

    if (realm === 'app')
      await this.sessions.revokeCommunitySession(session.sessionId, session.userId);
    else
      await this.sessions.revokeStaffSession({
        id: session.sessionId,
        staffUserId: session.userId,
        revokedByStaffUserId: session.userId,
        revocationType: 'logout'
      });
  }

  private async authenticatePassword(input: { mail: string; password: string }): Promise<UserWithPassword> {
    const mail = normalizeEmail(input.mail);
    const password = input.password;

    if (!mail || !password)
      throw badRequest('Missing fields', 'AUTH_MISSING_FIELDS');

    const authUser = await this.users.findAuthByEmail(mail);
    if (!authUser)
      throw unauthorized('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');

    if (!authUser.passwordHash)
      throw unauthorized('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');

    const ok = await bcrypt.compare(password, authUser.passwordHash);
    if (!ok)
      throw unauthorized('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');

    return authUser;
  }

  private withoutPassword(authUser: UserWithPassword): User {
    const { passwordHash: _passwordHash, ...user } = authUser;
    return user;
  }

  private assertStaffCanAuthenticate(user: User): void {
    if (user.accountType !== 'staff')
      throw unauthorized('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');
    if (user.status === 'invited')
      throw unauthorized('Staff invitation is not active', 'STAFF_INVITED');
    if (user.status === 'locked')
      throw unauthorized('Staff account is locked', 'STAFF_LOCKED');
    if (user.status === 'disabled')
      throw unauthorized('Staff account is disabled', 'STAFF_DISABLED');
  }

  private async createSession( user: User, realm: SessionRealm, mfa?: { credentialId: string; verifiedAt: Date; ipAddress: string | null; userAgent: string | null; }): Promise<string> {
    const sessionId = randomUUID();
    const realmConfig = realm === 'app' ? env.auth.app : env.auth.admin;
    const expiresAt = new Date(Date.now() + realmConfig.jwtExpiresInMs);

    if (realm === 'app') {
      await this.sessions.createCommunitySession({ id: sessionId, userId: user.id, expiresAt });
    } else {
      if (!mfa)
        throw new TypeError('MFA verification is required for a staff session');
      const created = await this.sessions.createStaffSession({
        id: sessionId,
        userId: user.id,
        expiresAt,
        webAuthnCredentialId: mfa.credentialId,
        mfaVerifiedAt: mfa.verifiedAt,
        ipAddress: mfa.ipAddress,
        userAgent: mfa.userAgent
      });
      if (!created)
        throw unauthorized('Staff account is no longer active', 'STAFF_SESSION_CREATION_FORBIDDEN');
    }

    return signSessionToken(user, realm, sessionId);
  }
}
