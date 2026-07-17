export type CreateCommunitySessionInput = {
  id: string;
  userId: number;
  expiresAt: Date;
};

export type CreateStaffSessionInput = CreateCommunitySessionInput & {
  webAuthnCredentialId: string;
  mfaVerifiedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
};

export type StaffSession = {
  id: string;
  mfaMethod: 'webauthn';
  mfaVerifiedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: Date;
  createdAt: Date;
};

export type StaffSessionRevocationType = 'logout' | 'self' | 'admin';

export type RevokeStaffSessionInput = {
  id: string;
  staffUserId: number;
  revokedByStaffUserId: number;
  revocationType: StaffSessionRevocationType;
};

export interface SessionRepository {
  createCommunitySession(input: CreateCommunitySessionInput): Promise<void>;
  createStaffSession(input: CreateStaffSessionInput): Promise<void>;
  isCommunitySessionActive(id: string, userId: number): Promise<boolean>;
  isStaffSessionActive(id: string, userId: number): Promise<boolean>;
  findActiveStaffSessionsByUserId(userId: number): Promise<StaffSession[]>;
  revokeCommunitySession(id: string, userId: number): Promise<void>;
  revokeStaffSession(input: RevokeStaffSessionInput, db?: PoolConnection): Promise<boolean>;
}
import type { PoolConnection } from 'mysql2/promise';
