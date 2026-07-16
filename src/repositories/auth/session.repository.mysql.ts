import { firstOrNull } from '../../utils/array.js';

import type {
  CreateCommunitySessionInput,
  CreateStaffSessionInput,
  SessionRepository
} from './session.repository.interface.js';
import type { RowDataPacket } from 'mysql2';
import type { Pool } from 'mysql2/promise';

type ActiveSessionRow = RowDataPacket & {
  One: number;
};

export class SessionRepositoryMysql implements SessionRepository {
  constructor(private readonly db: Pool) { }

  async createCommunitySession(input: CreateCommunitySessionInput): Promise<void> {
    await this.db.execute(
      `INSERT INTO CommunitySessions (Id, CommunityUserId, ExpiresAt)
       VALUES (?, ?, ?)`,
      [input.id, input.userId, input.expiresAt]
    );
  }

  async createStaffSession(input: CreateStaffSessionInput): Promise<void> {
    await this.db.execute(
      `INSERT INTO StaffSessions (Id, StaffUserId, MfaVerifiedAt, ExpiresAt)
       VALUES (?, ?, ?, ?)`,
      [input.id, input.userId, input.mfaVerifiedAt, input.expiresAt]
    );
  }

  async isCommunitySessionActive(id: string, userId: number): Promise<boolean> {
    return this.isSessionActive('CommunitySessions', 'CommunityUserId', id, userId);
  }

  async isStaffSessionActive(id: string, userId: number): Promise<boolean> {
    return this.isSessionActive('StaffSessions', 'StaffUserId', id, userId, true);
  }

  async revokeCommunitySession(id: string, userId: number): Promise<void> {
    await this.revokeSession('CommunitySessions', 'CommunityUserId', id, userId);
  }

  async revokeStaffSession(id: string, userId: number): Promise<void> {
    await this.revokeSession('StaffSessions', 'StaffUserId', id, userId);
  }

  private async isSessionActive(
    table: 'CommunitySessions' | 'StaffSessions',
    userColumn: 'CommunityUserId' | 'StaffUserId',
    id: string,
    userId: number,
    requireMfa = false
  ): Promise<boolean> {
    const mfaClause = requireMfa ? 'AND MfaVerifiedAt IS NOT NULL' : '';
    const [rows] = await this.db.execute(
      `SELECT 1 AS One
       FROM ${table}
       WHERE Id = ?
         AND ${userColumn} = ?
         AND RevokedAt IS NULL
         AND ExpiresAt > CURRENT_TIMESTAMP
         ${mfaClause}
       LIMIT 1`,
      [id, userId]
    );

    return firstOrNull(rows as ActiveSessionRow[]) !== null;
  }

  private async revokeSession(
    table: 'CommunitySessions' | 'StaffSessions',
    userColumn: 'CommunityUserId' | 'StaffUserId',
    id: string,
    userId: number
  ): Promise<void> {
    await this.db.execute(
      `UPDATE ${table}
       SET RevokedAt = COALESCE(RevokedAt, CURRENT_TIMESTAMP)
       WHERE Id = ? AND ${userColumn} = ?`,
      [id, userId]
    );
  }
}
