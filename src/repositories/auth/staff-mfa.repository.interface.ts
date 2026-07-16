import type { AuthenticatorTransportFuture, CredentialDeviceType } from '@simplewebauthn/server';

export type StaffWebAuthnCredential = {
  credentialId: string;
  staffUserId: number;
  publicKey: Uint8Array<ArrayBuffer>;
  signatureCounter: number;
  transports: AuthenticatorTransportFuture[];
  deviceType: CredentialDeviceType;
  backedUp: boolean;
  aaguid: string;
};

export type StaffMfaEnrollmentContext = {
  invitationId: number;
  staffUserId: number;
  mail: string;
  username: string;
};

export type StaffWebAuthnChallenge = {
  id: string;
  staffUserId: number;
  invitationId: number | null;
  challenge: string;
  expiresAt: Date;
};

export type CreateStaffWebAuthnChallengeInput = Omit<StaffWebAuthnChallenge, 'expiresAt'> & {
  purpose: 'registration' | 'authentication';
  ttlMs: number;
};

export type CompleteStaffMfaEnrollmentInput = {
  challengeId: string;
  invitationTokenHash: string;
  passwordHash: string;
  credential: StaffWebAuthnCredential;
};

export type CompleteStaffMfaAuthenticationInput = {
  challengeId: string;
  staffUserId: number;
  credentialId: string;
  expectedCounter: number;
  newCounter: number;
};

export interface StaffMfaRepository {
  findEnrollmentContext(invitationTokenHash: string): Promise<StaffMfaEnrollmentContext | null>;
  findCredentialsByStaffUserId(staffUserId: number): Promise<StaffWebAuthnCredential[]>;
  findCredential(staffUserId: number, credentialId: string): Promise<StaffWebAuthnCredential | null>;
  saveChallenge(input: CreateStaffWebAuthnChallengeInput): Promise<void>;
  findRegistrationChallenge(id: string, invitationTokenHash: string): Promise<StaffWebAuthnChallenge | null>;
  findAuthenticationChallenge(id: string): Promise<StaffWebAuthnChallenge | null>;
  completeEnrollment(input: CompleteStaffMfaEnrollmentInput): Promise<boolean>;
  completeAuthentication(input: CompleteStaffMfaAuthenticationInput): Promise<boolean>;
}
