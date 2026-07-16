import { randomUUID } from 'node:crypto';

import bcrypt from 'bcrypt';

import { validatePassword } from './password-policy.js';
import { signSessionToken, verifySessionToken } from './session-token.js';
import { env } from '../../utils/env.js';
import { conflict, unauthorized, badRequest } from '../../utils/errors.js';
import { normalizeEmail } from '../../utils/string.js';

import type { EmailValidationService } from './email-validation.service.js';
import type { StaffMfaVerifier } from './staff-mfa.service.js';
import type { SessionRepository } from '../../repositories/auth/session.repository.interface.js';
import type { UserRepository } from '../../repositories/users/user.repository.interface.js';
import type { User, UserWithPassword } from '../../repositories/users/user.types.js';
import type { SessionRealm } from '../../utils/session-cookie.js';

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly emailValidationService: EmailValidationService,
    private readonly sessions: SessionRepository,
    private readonly staffMfa: StaffMfaVerifier
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

  async loginStaff(input: { mail: string; password: string; mfaCode: string }): Promise<{ user: User; token: string }> {
    const authUser = await this.authenticatePassword(input);

    if (authUser.accountType !== 'staff')
      throw unauthorized('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');
    if (authUser.status === 'invited')
      throw unauthorized('Staff invitation is not active', 'STAFF_INVITED');
    if (authUser.status === 'locked')
      throw unauthorized('Staff account is locked', 'STAFF_LOCKED');
    if (authUser.status === 'disabled')
      throw unauthorized('Staff account is disabled', 'STAFF_DISABLED');

    const mfaVerification = await this.staffMfa.verify(authUser.id, input.mfaCode);
    if (mfaVerification === 'not_enrolled')
      throw unauthorized('Staff MFA enrollment is required', 'STAFF_MFA_REQUIRED');
    if (mfaVerification !== 'verified')
      throw unauthorized('Invalid MFA code', 'AUTH_INVALID_MFA_CODE');

    const user = this.withoutPassword(authUser);
    const token = await this.createSession(user, 'admin', new Date());

    return { user, token };
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
      await this.sessions.revokeStaffSession(session.sessionId, session.userId);
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

  private async createSession(user: User, realm: SessionRealm, mfaVerifiedAt?: Date): Promise<string> {
    const sessionId = randomUUID();
    const realmConfig = realm === 'app' ? env.auth.app : env.auth.admin;
    const expiresAt = new Date(Date.now() + realmConfig.jwtExpiresInMs);

    if (realm === 'app') {
      await this.sessions.createCommunitySession({ id: sessionId, userId: user.id, expiresAt });
    } else {
      if (!mfaVerifiedAt)
        throw new TypeError('MFA verification is required for a staff session');
      await this.sessions.createStaffSession({ id: sessionId, userId: user.id, expiresAt, mfaVerifiedAt });
    }

    return signSessionToken(user, realm, sessionId);
  }
}
