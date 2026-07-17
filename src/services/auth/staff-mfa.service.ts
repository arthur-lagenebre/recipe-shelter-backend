import { randomUUID } from 'node:crypto';

import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import bcrypt from 'bcrypt';

import { validatePassword } from './password-policy.js';
import { env } from '../../utils/env.js';
import { badRequest, conflict, unauthorized } from '../../utils/errors.js';
import { hashStaffInvitationToken } from '../../utils/security/staff-invitation-token.js';

import type { StaffMfaRepository } from '../../repositories/auth/staff-mfa.repository.interface.js';
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from '@simplewebauthn/server';

type StaffWebAuthnServer = {
  generateAuthenticationOptions: typeof generateAuthenticationOptions;
  generateRegistrationOptions: typeof generateRegistrationOptions;
  verifyAuthenticationResponse: typeof verifyAuthenticationResponse;
  verifyRegistrationResponse: typeof verifyRegistrationResponse;
};

type StaffMfaServiceOptions = {
  challengeTtlMs?: number;
  now?: () => Date;
  randomId?: () => string;
  hashInvitationToken?: (token: string) => string;
  hashPassword?: (password: string) => Promise<string>;
  webAuthn?: StaffWebAuthnServer;
  webAuthnOrigin?: string;
  webAuthnRpId?: string;
  webAuthnRpName?: string;
};

const MAX_CHALLENGE_TTL_MS = 600_000;

export type StaffMfaOptionsResult<T> = {
  flowId: string;
  publicKey: T;
};

export interface StaffMfaManager {
  beginEnrollment(invitationToken: string): Promise<StaffMfaOptionsResult<PublicKeyCredentialCreationOptionsJSON>>;
  completeEnrollment(input: { flowId: string; invitationToken: string; password: string; credential: RegistrationResponseJSON; }): Promise<{ userId: number; status: 'active'; mfaEnrolled: true }>;
  beginAuthentication(staffUserId: number, expectedSessionVersion: number): Promise<StaffMfaOptionsResult<PublicKeyCredentialRequestOptionsJSON>>;
  completeAuthentication(flowId: string, response: AuthenticationResponseJSON): Promise<{ staffUserId: number; sessionVersion: number; credentialId: string; verifiedAt: Date; }>;
}

export class StaffMfaService implements StaffMfaManager {
  private readonly challengeTtlMs: number;
  private readonly now: () => Date;
  private readonly randomId: () => string;
  private readonly hashInvitationToken: (token: string) => string;
  private readonly hashPassword: (password: string) => Promise<string>;
  private readonly webAuthn: StaffWebAuthnServer;
  private readonly webAuthnOrigin: string;
  private readonly webAuthnRpId: string;
  private readonly webAuthnRpName: string;

  constructor(private readonly repository: StaffMfaRepository,options: StaffMfaServiceOptions = {}) {
    this.challengeTtlMs = options.challengeTtlMs ?? env.auth.staffMfa.challengeTtlMs;
    this.now = options.now ?? (() => new Date());
    this.randomId = options.randomId ?? randomUUID;
    this.hashInvitationToken = options.hashInvitationToken ?? hashStaffInvitationToken;
    this.hashPassword = options.hashPassword ?? ((password) => bcrypt.hash(password, env.auth.bcryptCost));
    this.webAuthn = options.webAuthn ?? { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse };
    this.webAuthnOrigin = options.webAuthnOrigin ?? env.auth.staffMfa.webAuthnOrigin;
    this.webAuthnRpId = options.webAuthnRpId ?? env.auth.staffMfa.webAuthnRpId;
    this.webAuthnRpName = options.webAuthnRpName ?? env.auth.staffMfa.webAuthnRpName;

    if (!Number.isInteger(this.challengeTtlMs) || this.challengeTtlMs <= 0 || this.challengeTtlMs > MAX_CHALLENGE_TTL_MS)
      throw new TypeError('Staff MFA challenge TTL must be a positive integer of at most 10 minutes');
  }

  async beginEnrollment(invitationToken: string): Promise<StaffMfaOptionsResult<PublicKeyCredentialCreationOptionsJSON>> {
    const cleanToken = invitationToken.trim();
    if (!cleanToken)
      throw badRequest('Invitation token is required', 'STAFF_MFA_INVITATION_TOKEN_REQUIRED');

    const context = await this.repository.findEnrollmentContext(this.hashInvitationToken(cleanToken));
    if (!context)
      throw badRequest('Invalid, expired or already used invitation token', 'STAFF_MFA_INVITATION_INVALID');

    const credentials = await this.repository.findCredentialsByStaffUserId(context.staffUserId);
    const publicKey = await this.webAuthn.generateRegistrationOptions({
      rpName: this.webAuthnRpName,
      rpID: this.webAuthnRpId,
      userID: staffUserIdBytes(context.staffUserId),
      userName: context.mail,
      userDisplayName: context.username,
      timeout: this.challengeTtlMs,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required'
      },
      excludeCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports
      }))
    });
    const flowId = this.randomId();
    const saved = await this.repository.saveChallenge({
      id: flowId,
      staffUserId: context.staffUserId,
      invitationId: context.invitationId,
      purpose: 'registration',
      expectedSessionVersion: null,
      challenge: publicKey.challenge,
      ttlMs: this.challengeTtlMs
    });
    if (!saved)
      throw badRequest('Invalid or expired staff invitation', 'STAFF_MFA_INVITATION_INVALID');

    return { flowId, publicKey };
  }

  async completeEnrollment(input: { flowId: string; invitationToken: string; password: string; credential: RegistrationResponseJSON; }): Promise<{ userId: number; status: 'active'; mfaEnrolled: true }> {
    const passwordError = validatePassword(input.password);
    if (passwordError)
      throw badRequest(passwordError, 'AUTH_WEAK_PASSWORD');

    const invitationTokenHash = this.hashInvitationToken(input.invitationToken.trim());
    const challenge = await this.repository.findRegistrationChallenge(input.flowId, invitationTokenHash);
    if (!challenge)
      throw badRequest('Invalid or expired MFA enrollment flow', 'STAFF_MFA_ENROLLMENT_INVALID');

    let verification;
    try {
      verification = await this.webAuthn.verifyRegistrationResponse({
        response: input.credential,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.webAuthnOrigin,
        expectedRPID: this.webAuthnRpId,
        requireUserVerification: true
      });
    } catch {
      throw badRequest('WebAuthn registration response is invalid', 'STAFF_MFA_REGISTRATION_FAILED');
    }

    if (!verification.verified || !verification.registrationInfo)
      throw badRequest('WebAuthn registration response is invalid', 'STAFF_MFA_REGISTRATION_FAILED');

    const passwordHash = await this.hashPassword(input.password);
    const { credential, credentialDeviceType, credentialBackedUp, aaguid } = verification.registrationInfo;

    try {
      const completed = await this.repository.completeEnrollment({
        challengeId: challenge.id,
        invitationTokenHash,
        passwordHash,
        credential: {
          credentialId: credential.id,
          staffUserId: challenge.staffUserId,
          publicKey: credential.publicKey,
          signatureCounter: credential.counter,
          transports: credential.transports ?? input.credential.response.transports ?? [],
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
          aaguid
        }
      });

      if (!completed)
        throw badRequest('Invalid or expired MFA enrollment flow', 'STAFF_MFA_ENROLLMENT_INVALID');
    } catch (error) {
      if (isDuplicateEntry(error))
        throw conflict('This WebAuthn credential is already enrolled', 'STAFF_MFA_CREDENTIAL_EXISTS');
      throw error;
    }

    return { userId: challenge.staffUserId, status: 'active', mfaEnrolled: true };
  }

  async beginAuthentication(staffUserId: number, expectedSessionVersion: number): Promise<StaffMfaOptionsResult<PublicKeyCredentialRequestOptionsJSON>> {
    const credentials = await this.repository.findCredentialsByStaffUserId(staffUserId);
    if (!credentials.length)
      throw unauthorized('Staff MFA enrollment is required', 'STAFF_MFA_REQUIRED');

    const publicKey = await this.webAuthn.generateAuthenticationOptions({
      rpID: this.webAuthnRpId,
      timeout: this.challengeTtlMs,
      userVerification: 'required',
      allowCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports
      }))
    });
    const flowId = this.randomId();
    const saved = await this.repository.saveChallenge({
      id: flowId,
      staffUserId,
      invitationId: null,
      purpose: 'authentication',
      expectedSessionVersion,
      challenge: publicKey.challenge,
      ttlMs: this.challengeTtlMs
    });
    if (!saved)
      throw unauthorized('Staff security state changed', 'STAFF_SESSION_CREATION_FORBIDDEN');

    return { flowId, publicKey };
  }

  async completeAuthentication(flowId: string, response: AuthenticationResponseJSON): Promise<{ staffUserId: number; sessionVersion: number; credentialId: string; verifiedAt: Date; }> {
    const challenge = await this.repository.findAuthenticationChallenge(flowId);
    if (!challenge)
      throw unauthorized('Invalid or expired MFA authentication flow', 'AUTH_INVALID_MFA_ASSERTION');

    if (response.response.userHandle && response.response.userHandle !== staffUserIdHandle(challenge.staffUserId))
      throw unauthorized('Invalid MFA assertion', 'AUTH_INVALID_MFA_ASSERTION');

    const credential = await this.repository.findCredential(challenge.staffUserId, response.id);
    if (!credential)
      throw unauthorized('Invalid MFA assertion', 'AUTH_INVALID_MFA_ASSERTION');

    let verification;
    try {
      verification = await this.webAuthn.verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.webAuthnOrigin,
        expectedRPID: this.webAuthnRpId,
        requireUserVerification: true,
        credential: {
          id: credential.credentialId,
          publicKey: credential.publicKey,
          counter: credential.signatureCounter,
          transports: credential.transports
        }
      });
    } catch {
      throw unauthorized('Invalid MFA assertion', 'AUTH_INVALID_MFA_ASSERTION');
    }

    if (!verification.verified)
      throw unauthorized('Invalid MFA assertion', 'AUTH_INVALID_MFA_ASSERTION');

    const completed = await this.repository.completeAuthentication({
      challengeId: challenge.id,
      staffUserId: challenge.staffUserId,
      credentialId: credential.credentialId,
      expectedCounter: credential.signatureCounter,
      newCounter: verification.authenticationInfo.newCounter
    });

    if (!completed)
      throw unauthorized('MFA assertion has already been used', 'AUTH_INVALID_MFA_ASSERTION');

    return {
      staffUserId: challenge.staffUserId,
      sessionVersion: challenge.sessionVersion,
      credentialId: credential.credentialId,
      verifiedAt: this.now()
    };
  }
}

function staffUserIdBytes(userId: number): Uint8Array<ArrayBuffer> {
  if (!Number.isSafeInteger(userId) || userId <= 0)
    throw new TypeError('Staff user ID must be a positive safe integer');

  const value = new Uint8Array(8);
  new DataView(value.buffer).setBigUint64(0, BigInt(userId));
  
  return value;
}

function staffUserIdHandle(userId: number): string {
  return Buffer.from(staffUserIdBytes(userId)).toString('base64url');
}

function isDuplicateEntry(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ER_DUP_ENTRY');
}
