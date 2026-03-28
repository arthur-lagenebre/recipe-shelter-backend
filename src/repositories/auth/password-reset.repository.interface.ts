export type PasswordResetCreateInput = {
    userId: number;
    tokenHash: string;
    expiresAt: Date;
};

export type PasswordResetRecord = {
    Id: number;
    UserId: number;
};

export interface PasswordResetRepository {
    create(input: PasswordResetCreateInput): Promise<void>;
    invalidateAllForUser(userId: number): Promise<void>;
    findValidByTokenHash(tokenHash: string): Promise<PasswordResetRecord | null>;
    markUsed(id: number): Promise<void>;
}
