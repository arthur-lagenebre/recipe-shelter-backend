import type { Pool } from 'mysql2/promise';

export interface PasswordResetRow {
    Id: number;
    UserId: number;
    TokenHash: string;
    ExpiresAt: Date | string;
    UsedAt: Date | string | null;
    CreatedAt: Date | string;
}

export class PasswordResetRepositoryMysql {
    constructor(private readonly pool: Pool) { }

    async create(input: { userId: number; tokenHash: string; expiresAt: Date }): Promise<void> {
        await this.pool.query(
            `INSERT INTO PasswordResets (UserId, TokenHash, ExpiresAt)
            VALUES (?, ?, ?)`,
            [input.userId, input.tokenHash, input.expiresAt]
        );
    }

    async invalidateAllForUser(userId: number): Promise<void> {
        await this.pool.query(
            `UPDATE PasswordResets
            SET UsedAt = NOW()
            WHERE UserId = ?
                AND UsedAt IS NULL
                AND ExpiresAt > NOW()`,
            [userId]
        );
    }

    async findValidByTokenHash(tokenHash: string): Promise<PasswordResetRow | null> {
        const [rows] = await this.pool.query(
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
        await this.pool.query(
            `UPDATE PasswordResets
            SET UsedAt = NOW()
            WHERE Id = ?`,
            [id]
        );
    }
}