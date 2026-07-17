export type CreateCommunitySessionInput = {
  id: string;
  userId: number;
  expiresAt: Date;
};

export type CreateStaffSessionInput = CreateCommunitySessionInput & {
  sessionVersion: number;
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

export type StaffSessionRevocationType = 'logout' | 'self' | 'suspected_compromise';

export type RevokeStaffSessionInput = {
  id: string;
  staffUserId: number;
  revokedByStaffUserId: number;
  revocationType: StaffSessionRevocationType;
};

export interface SessionRepository {
  createCommunitySession(input: CreateCommunitySessionInput): Promise<void>;
  createStaffSession(input: CreateStaffSessionInput): Promise<boolean>;
  isCommunitySessionActive(id: string, userId: number): Promise<boolean>;
  isStaffSessionActive(id: string, userId: number): Promise<boolean>;
  isStaffSessionRecentlyAuthenticated(id: string, userId: number, authenticatedAfter: Date): Promise<boolean>;
  findActiveStaffSessionsByUserId(userId: number, db?: PoolConnection): Promise<StaffSession[]>;
  revokeCommunitySession(id: string, userId: number): Promise<void>;
  revokeStaffSession(input: RevokeStaffSessionInput, db?: PoolConnection): Promise<boolean>;
}
import type { PoolConnection } from 'mysql2/promise';
