export type CreateCommunitySessionInput = {
  id: string;
  userId: number;
  expiresAt: Date;
};

export type CreateStaffSessionInput = CreateCommunitySessionInput & {
  webAuthnCredentialId: string;
  mfaVerifiedAt: Date;
};

export interface SessionRepository {
  createCommunitySession(input: CreateCommunitySessionInput): Promise<void>;
  createStaffSession(input: CreateStaffSessionInput): Promise<void>;
  isCommunitySessionActive(id: string, userId: number): Promise<boolean>;
  isStaffSessionActive(id: string, userId: number): Promise<boolean>;
  revokeCommunitySession(id: string, userId: number): Promise<void>;
  revokeStaffSession(id: string, userId: number): Promise<void>;
}
