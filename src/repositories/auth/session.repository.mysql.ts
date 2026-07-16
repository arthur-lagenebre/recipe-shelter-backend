import { firstOrNull } from '../../utils/array.js';

import type { CreateCommunitySessionInput, CreateStaffSessionInput, RevokeStaffSessionInput, StaffSession, SessionRepository } from './session.repository.interface.js';
import type { RowDataPacket } from 'mysql2';
import type { Pool, ResultSetHeader } from 'mysql2/promise';

type ActiveSessionRow = RowDataPacket & {
  One: number;
};

type StaffSessionRow = RowDataPacket & {
  Id: string;
  MfaMethod: 'webauthn';
  MfaVerifiedAt: Date;
  IpAddress: string | null;
  UserAgent: string | null;
  ExpiresAt: Date;
  CreatedAt: Date;
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
      `INSERT INTO StaffSessions
         (Id, StaffUserId, WebAuthnCredentialId, MfaVerifiedAt, IpAddress, UserAgent, ExpiresAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.userId,
        input.webAuthnCredentialId,
        input.mfaVerifiedAt,
        input.ipAddress,
        input.userAgent,
        input.expiresAt
      ]
    );
  }

  async isCommunitySessionActive(id: string, userId: number): Promise<boolean> {
    return this.isSessionActive('CommunitySessions', 'CommunityUserId', id, userId);
  }

  async isStaffSessionActive(id: string, userId: number): Promise<boolean> {
    return this.isSessionActive('StaffSessions', 'StaffUserId', id, userId, true);
  }

  async findActiveStaffSessionsByUserId(userId: number): Promise<StaffSession[]> {
    const [rows] = await this.db.execute(
      `SELECT Id, MfaMethod, MfaVerifiedAt, IpAddress, UserAgent, ExpiresAt, CreatedAt
       FROM StaffSessions
       WHERE StaffUserId = ?
         AND RevokedAt IS NULL
         AND ExpiresAt > CURRENT_TIMESTAMP
         AND MfaVerifiedAt IS NOT NULL
         AND WebAuthnCredentialId IS NOT NULL
         AND MfaMethod = 'webauthn'
       ORDER BY CreatedAt DESC, Id DESC`,
      [userId]
    );

    return (rows as StaffSessionRow[]).map((row) => ({
      id: row.Id,
      mfaMethod: row.MfaMethod,
      mfaVerifiedAt: row.MfaVerifiedAt,
      ipAddress: row.IpAddress,
      userAgent: row.UserAgent,
      expiresAt: row.ExpiresAt,
      createdAt: row.CreatedAt
    }));
  }

  async revokeCommunitySession(id: string, userId: number): Promise<void> {
    await this.revokeSession('CommunitySessions', 'CommunityUserId', id, userId);
  }

  async revokeStaffSession(input: RevokeStaffSessionInput): Promise<boolean> {
    const [result] = await this.db.execute<ResultSetHeader>(
      `UPDATE StaffSessions
       SET RevokedAt = CURRENT_TIMESTAMP,
           RevokedByStaffUserId = ?,
           RevocationType = ?
       WHERE Id = ?
         AND StaffUserId = ?
         AND RevokedAt IS NULL
         AND ExpiresAt > CURRENT_TIMESTAMP`,
      [input.revokedByStaffUserId, input.revocationType, input.id, input.staffUserId]
    );

    return result.affectedRows > 0;
  }

  private async isSessionActive(
    table: 'CommunitySessions' | 'StaffSessions',
    userColumn: 'CommunityUserId' | 'StaffUserId',
    id: string,
    userId: number,
    requireMfa = false
  ): Promise<boolean> {
    const mfaClause = requireMfa
      ? "AND MfaVerifiedAt IS NOT NULL AND WebAuthnCredentialId IS NOT NULL AND MfaMethod = 'webauthn'"
      : '';
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
