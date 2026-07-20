import type {
    EmailValidationCreateInput,
    EmailValidationRepository,
    EmailValidationRecord
} from './email-validation.repository.interface.js';
import type { Pool } from 'mysql2/promise';

export interface EmailValidationRow {
    Id: number;
    UserId: number;
    TokenHash: string;
    ExpiresAt: Date | string;
    UsedAt: Date | string | null;
    CreatedAt: Date | string;
}

export class EmailValidationRepositoryMysql implements EmailValidationRepository {
    constructor(private readonly db: Pool) {}

    async create(input: EmailValidationCreateInput): Promise<void> {
        await this.db.execute(
            `INSERT INTO EmailValidations (UserId, TokenHash, ExpiresAt)
             VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
            [input.userId, input.tokenHash, input.expiresInMinutes]
        );
    }

    async invalidateAllForUser(userId: number): Promise<void> {
        await this.db.execute(
            `UPDATE EmailValidations
             SET UsedAt = NOW()
             WHERE UserId = ?
                AND UsedAt IS NULL
                AND ExpiresAt > NOW()`,
            [userId]
        );
    }

    async findByTokenHash(tokenHash: string): Promise<EmailValidationRecord | null> {
        const [rows] = await this.db.execute(
            `SELECT Id, UserId, TokenHash, ExpiresAt, UsedAt, CreatedAt
             FROM EmailValidations
             WHERE TokenHash = ?
             LIMIT 1`,
            [tokenHash]
        );

        const list = rows as EmailValidationRow[];

        return list[0] ?? null;
    }

    async markUsed(id: number): Promise<void> {
        await this.db.execute(
            `UPDATE EmailValidations
             SET UsedAt = NOW()
             WHERE Id = ?`,
            [id]
        );
    }
}
