export type EmailValidationCreateInput = {
    userId: number;
    tokenHash: string;
    expiresInMinutes: number;
};

export type EmailValidationRecord = {
    Id: number;
    UserId: number;
    ExpiresAt: Date | string;
    UsedAt: Date | string | null;
};

export interface EmailValidationRepository {
    create(input: EmailValidationCreateInput): Promise<void>;
    invalidateAllForUser(userId: number): Promise<void>;
    findByTokenHash(tokenHash: string): Promise<EmailValidationRecord | null>;
    markUsed(id: number): Promise<void>;
}
