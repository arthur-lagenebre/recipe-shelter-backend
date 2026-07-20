import type { PasswordResetCreateInput, PasswordResetRepository } from './password-reset.repository.interface.js';
import type { Pool } from 'mysql2/promise';

export interface PasswordResetRow {
    Id: number;
    UserId: number;
    TokenHash: string;
    ExpiresAt: Date | string;
    UsedAt: Date | string | null;
    CreatedAt: Date | string;
}

export class PasswordResetRepositoryMysql implements PasswordResetRepository {
    constructor(private readonly db: Pool) {}

    async create(input: PasswordResetCreateInput): Promise<void> {
        await this.db.execute(
            `INSERT INTO PasswordResets (UserId, TokenHash, ExpiresAt)
            VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
            [input.userId, input.tokenHash, input.expiresInMinutes]
        );
    }

    async invalidateAllForUser(userId: number): Promise<void> {
        await this.db.execute(
            `UPDATE PasswordResets
            SET UsedAt = NOW()
            WHERE UserId = ?
                AND UsedAt IS NULL
                AND ExpiresAt > NOW()`,
            [userId]
        );
    }

    async findValidByTokenHash(tokenHash: string): Promise<PasswordResetRow | null> {
        const [rows] = await this.db.execute(
            `SELECT Id, UserId, TokenHash, ExpiresAt, UsedAt, CreatedAt
            FROM PasswordResets
            WHERE TokenHash = ?
                AND UsedAt IS NULL
                AND ExpiresAt > NOW()
            LIMIT 1`,
            [tokenHash]
        );

        const list = rows as PasswordResetRow[];

        return list[0] ?? null;
    }

    async markUsed(id: number): Promise<void> {
        await this.db.execute(
            `UPDATE PasswordResets
            SET UsedAt = NOW()
            WHERE Id = ?`,
            [id]
        );
    }
}
