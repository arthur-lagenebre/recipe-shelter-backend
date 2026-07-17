import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { AuthService } from '../../../src/services/auth/auth.service.js';
import { env } from '../../../src/utils/env.js';
import { HttpError } from '../../../src/utils/errors.js';
import { TestSessionRepository } from '../../helpers/auth-session.js';

import type { UserRepository } from '../../../src/repositories/users/user.repository.interface.js';
import type { CreateUserInput, User, UserWithPassword } from '../../../src/repositories/users/user.types.js';
import type { EmailValidationService } from '../../../src/services/auth/email-validation.service.js';
import type { StaffMfaManager } from '../../../src/services/auth/staff-mfa.service.js';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';

const baseUser: User = {
  id: 2,
  mail: 'user@example.com',
  username: 'testuser',
  accountType: 'community',
  status: 'active',
  emailValidatedAt: new Date('2026-05-09T10:00:00.000Z'),
  bannedByUserId: null,
  bannedReason: null,
  bannedAt: null,
  createdAt: new Date('2026-05-09T10:00:00.000Z'),
  updatedAt: new Date('2026-05-09T10:00:00.000Z')
};

class FakeUserRepository implements Partial<UserRepository> {
  createdInput: CreateUserInput | null = null;
  emailTaken = false;
  usernameTaken = false;
  authUser: UserWithPassword | null = null;
  userById: User | null = null;

  async isEmailTaken(): Promise<boolean> {
    return this.emailTaken;
  }

  async isUsernameTaken(): Promise<boolean> {
    return this.usernameTaken;
  }

  async create(input: CreateUserInput): Promise<User> {
    this.createdInput = input;

    return { ...baseUser, mail: input.mail, username: input.username, accountType: input.accountType, status: input.status ?? 'active' };
  }

  async findAuthByEmail(): Promise<UserWithPassword | null> {
    return this.authUser;
  }

  async findById(): Promise<User | null> {
    return this.userById;
  }
}

class FakeEmailValidationService {
  sentUser: User | null = null;

  async sendValidationEmailForUser(user: User): Promise<void> {
    this.sentUser = user;
  }
}

class FakeStaffMfa implements StaffMfaManager {
  authenticationUserId: number | null = null;
  authenticationCompleted = true;
  enrollmentInput: unknown = null;

  async beginEnrollment() {
    return { flowId: 'enrollment-flow', publicKey: {} as never };
  }

  async completeEnrollment(input: unknown) {
    this.enrollmentInput = input;
    return { userId: 2, status: 'active' as const, mfaEnrolled: true as const };
  }

  async beginAuthentication(userId: number) {
    this.authenticationUserId = userId;
    return { flowId: 'authentication-flow', publicKey: { challenge: 'challenge' } as never };
  }

  async completeAuthentication() {
    if (!this.authenticationCompleted)
      throw new HttpError(401, 'Invalid MFA assertion', 'AUTH_INVALID_MFA_ASSERTION');

    return {
      staffUserId: 2,
      credentialId: 'credential-1',
      verifiedAt: new Date('2026-07-16T12:00:00.000Z')
    };
  }
}

const authenticationCredential = {
  id: 'credential-1',
  rawId: 'credential-1',
  type: 'public-key',
  clientExtensionResults: {},
  response: {
    clientDataJSON: 'client-data',
    authenticatorData: 'authenticator-data',
    signature: 'signature'
  }
} as AuthenticationResponseJSON;

const registrationCredential = {
  id: 'credential-1',
  rawId: 'credential-1',
  type: 'public-key',
  clientExtensionResults: {},
  response: {
    clientDataJSON: 'client-data',
    attestationObject: 'attestation'
  }
} as RegistrationResponseJSON;

function assertHttpError(error: unknown, code: string, status: number): boolean {
  assert.ok(error instanceof HttpError);
  assert.equal(error.code, code);
  assert.equal(error.statusCode, status);

  return true;
}

describe('AuthService', () => {
  let users: FakeUserRepository;
  let emailValidation: FakeEmailValidationService;
  let sessions: TestSessionRepository;
  let staffMfa: FakeStaffMfa;
  let service: AuthService;

  beforeEach(() => {
    env.auth.bcryptCost = 4;
    users = new FakeUserRepository();
    emailValidation = new FakeEmailValidationService();
    sessions = new TestSessionRepository();
    staffMfa = new FakeStaffMfa();
    service = new AuthService(
      users as unknown as UserRepository,
      emailValidation as unknown as EmailValidationService,
      sessions,
      staffMfa
    );
  });

  it('registers inactive community users and sends a validation email', async () => {
    const result = await service.register({ mail: ' USER@Example.COM ', username: ' testuser ', password: 'Recipe42?' });

    assert.equal(users.createdInput?.mail, 'user@example.com');
    assert.equal(users.createdInput?.username, 'testuser');
    assert.equal(users.createdInput?.accountType, 'community');
    assert.equal(users.createdInput?.status, 'inactive');
    assert.equal(await bcrypt.compare('Recipe42?', users.createdInput?.passwordHash ?? ''), true);
    assert.deepEqual(emailValidation.sentUser, result.user);
  });

  it('rejects invalid registration inputs and conflicts', async () => {
    await assert.rejects(() => service.register({ mail: '', username: 'testuser', password: 'Recipe42?' }), (error) => assertHttpError(error, 'AUTH_MISSING_FIELDS', 400));
    await assert.rejects(() => service.register({ mail: 'user@example.com', username: 'testuser', password: 'short' }), (error) => assertHttpError(error, 'AUTH_WEAK_PASSWORD', 400));

    users.emailTaken = true;
    await assert.rejects(() => service.register({ mail: 'user@example.com', username: 'testuser', password: 'Recipe42?' }), (error) => assertHttpError(error, 'AUTH_EMAIL_TAKEN', 409));
    users.emailTaken = false;
    users.usernameTaken = true;
    await assert.rejects(() => service.register({ mail: 'user@example.com', username: 'testuser', password: 'Recipe42?' }), (error) => assertHttpError(error, 'AUTH_USERNAME_TAKEN', 409));
  });

  it('issues only an app-audience session for an active community account', async () => {
    users.authUser = { ...baseUser, passwordHash: await bcrypt.hash('Recipe42?', 4) };

    const result = await service.loginCommunity({ mail: ' USER@Example.COM ', password: 'Recipe42?' });
    const payload = jwt.verify(result.token, env.auth.jwtSecret, { audience: env.auth.app.jwtAudience }) as jwt.JwtPayload;

    assert.equal(result.user.mail, 'user@example.com');
    assert.equal('passwordHash' in result.user, false);
    assert.equal(payload.accountType, 'community');
    assert.deepEqual(payload.amr, ['pwd']);
    assert.ok(payload.jti && sessions.communitySessions.has(payload.jti));
    assert.throws(() => jwt.verify(result.token, env.auth.jwtSecret, { audience: env.auth.admin.jwtAudience }));
  });

  it('never accepts a staff identity on the community login boundary', async () => {
    users.authUser = {
      ...baseUser,
      accountType: 'staff',
      status: 'active',
      passwordHash: await bcrypt.hash('Recipe42?', 4)
    };

    await assert.rejects(
      () => service.loginCommunity({ mail: 'user@example.com', password: 'Recipe42?' }),
      (error) => assertHttpError(error, 'AUTH_INVALID_CREDENTIALS', 401)
    );
    assert.equal(sessions.communitySessions.size, 0);
  });

  it('rejects invalid community credentials and lifecycle states', async () => {
    await assert.rejects(() => service.loginCommunity({ mail: '', password: 'Recipe42?' }), (error) => assertHttpError(error, 'AUTH_MISSING_FIELDS', 400));
    await assert.rejects(() => service.loginCommunity({ mail: 'user@example.com', password: 'Recipe42?' }), (error) => assertHttpError(error, 'AUTH_INVALID_CREDENTIALS', 401));

    users.authUser = { ...baseUser, passwordHash: await bcrypt.hash('Recipe42?', 4) };
    await assert.rejects(() => service.loginCommunity({ mail: 'user@example.com', password: 'wrong' }), (error) => assertHttpError(error, 'AUTH_INVALID_CREDENTIALS', 401));

    users.authUser = { ...baseUser, status: 'inactive', passwordHash: await bcrypt.hash('Recipe42?', 4) };
    await assert.rejects(() => service.loginCommunity({ mail: 'user@example.com', password: 'Recipe42?' }), (error) => assertHttpError(error, 'EMAIL_NOT_VALIDATED', 401));

    users.authUser = { ...baseUser, status: 'banned', passwordHash: await bcrypt.hash('Recipe42?', 4) };
    await assert.rejects(() => service.loginCommunity({ mail: 'user@example.com', password: 'Recipe42?' }), (error) => assertHttpError(error, 'USER_BANNED', 401));
  });

  it('issues WebAuthn options after the staff password but no session yet', async () => {
    users.authUser = {
      ...baseUser,
      accountType: 'staff',
      status: 'active',
      passwordHash: await bcrypt.hash('Recipe42?', 4)
    };

    const result = await service.beginStaffLogin({ mail: 'user@example.com', password: 'Recipe42?' });

    assert.equal(staffMfa.authenticationUserId, baseUser.id);
    assert.deepEqual(result, { flowId: 'authentication-flow', publicKey: { challenge: 'challenge' } });
    assert.equal(sessions.staffSessions.size, 0);
  });

  it('delegates invitation activation to the mandatory MFA enrollment without issuing a session', async () => {
    const input = {
      flowId: 'enrollment-flow',
      invitationToken: 'invitation-token',
      password: 'Recipe42?',
      credential: registrationCredential
    };

    assert.deepEqual(await service.activateStaffInvitation(input), {
      userId: 2,
      status: 'active',
      mfaEnrolled: true
    });
    assert.deepEqual(staffMfa.enrollmentInput, input);
    assert.equal(sessions.staffSessions.size, 0);
  });

  it('issues a shorter admin-audience session only after a verified WebAuthn assertion', async () => {
    users.userById = { ...baseUser, accountType: 'staff', status: 'active' };

    const result = await service.completeStaffLogin({
      flowId: 'authentication-flow',
      credential: authenticationCredential,
      ipAddress: '192.0.2.10',
      userAgent: 'Recipe Shelter test client'
    });
    const payload = jwt.verify(result.token, env.auth.jwtSecret, { audience: env.auth.admin.jwtAudience }) as jwt.JwtPayload;

    assert.equal(payload.accountType, 'staff');
    assert.deepEqual(payload.amr, ['pwd', 'webauthn']);
    assert.ok(payload.jti && sessions.staffSessions.has(payload.jti));
    assert.equal(sessions.staffSessions.get(payload.jti ?? '')?.webAuthnCredentialId, 'credential-1');
    assert.equal(sessions.staffSessions.get(payload.jti ?? '')?.ipAddress, '192.0.2.10');
    assert.equal(sessions.staffSessions.get(payload.jti ?? '')?.userAgent, 'Recipe Shelter test client');
    assert.ok((payload.exp ?? 0) - (payload.iat ?? 0) < env.auth.app.jwtExpiresInMs / 1000);
    assert.throws(() => jwt.verify(result.token, env.auth.jwtSecret, { audience: env.auth.app.jwtAudience }));
  });

  it('refuses session creation when the staff account is disabled during the MFA flow', async () => {
    users.userById = { ...baseUser, accountType: 'staff', status: 'active' };
    sessions.createStaffSession = async () => false;

    await assert.rejects(
      () => service.completeStaffLogin({
        flowId: 'authentication-flow',
        credential: authenticationCredential,
        ipAddress: '192.0.2.10',
        userAgent: 'Recipe Shelter test client'
      }),
      (error) => assertHttpError(error, 'STAFF_SESSION_CREATION_FORBIDDEN', 401)
    );
    assert.equal(sessions.staffSessions.size, 0);
  });

  it('refuses community identities and invalid WebAuthn assertions on the staff boundary', async () => {
    const passwordHash = await bcrypt.hash('Recipe42?', 4);
    users.authUser = { ...baseUser, passwordHash };
    await assert.rejects(
      () => service.beginStaffLogin({ mail: 'user@example.com', password: 'Recipe42?' }),
      (error) => assertHttpError(error, 'AUTH_INVALID_CREDENTIALS', 401)
    );

    staffMfa.authenticationCompleted = false;
    await assert.rejects(
      () => service.completeStaffLogin({
        flowId: 'flow',
        credential: authenticationCredential,
        ipAddress: null,
        userAgent: null
      }),
      (error) => assertHttpError(error, 'AUTH_INVALID_MFA_ASSERTION', 401)
    );
    assert.equal(sessions.staffSessions.size, 0);
  });

  it('rejects every blocked staff lifecycle state before MFA', async () => {
    const passwordHash = await bcrypt.hash('Recipe42?', 4);

    for (const [status, code] of [
      ['invited', 'STAFF_INVITED'],
      ['locked', 'STAFF_LOCKED'],
      ['disabled', 'STAFF_DISABLED']
    ] as const) {
      users.authUser = { ...baseUser, accountType: 'staff', status, passwordHash };
      await assert.rejects(
        () => service.beginStaffLogin({ mail: 'user@example.com', password: 'Recipe42?' }),
        (error) => assertHttpError(error, code, 401)
      );
    }

    assert.equal(staffMfa.authenticationUserId, null);
  });

  it('revokes only the session realm represented by the token', async () => {
    users.authUser = { ...baseUser, passwordHash: await bcrypt.hash('Recipe42?', 4) };
    const { token } = await service.loginCommunity({ mail: 'user@example.com', password: 'Recipe42?' });

    assert.equal(sessions.communitySessions.size, 1);
    await service.logout(token, 'admin');
    assert.equal(sessions.communitySessions.size, 1);
    await service.logout(token, 'app');
    assert.equal(sessions.communitySessions.size, 0);
  });
});
