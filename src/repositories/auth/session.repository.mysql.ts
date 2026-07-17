import { firstOrNull } from '../../utils/array.js';

import type { CreateCommunitySessionInput, CreateStaffSessionInput, RevokeStaffSessionInput, StaffSession, SessionRepository } from './session.repository.interface.js';
import type { RowDataPacket } from 'mysql2';
import type { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';

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

  async createStaffSession(input: CreateStaffSessionInput): Promise<boolean> {
    const [result] = await this.db.execute<ResultSetHeader>(
      `INSERT INTO StaffSessions
         (Id, StaffUserId, SessionVersion, WebAuthnCredentialId, MfaVerifiedAt, IpAddress, UserAgent, ExpiresAt)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       FROM StaffProfiles AS sp
       WHERE sp.UserId = ?
         AND sp.Status = 'active'
         AND sp.SessionVersion = ?
         AND EXISTS (
           SELECT 1
           FROM StaffRoles AS sr
           WHERE sr.StaffUserId = sp.UserId
         )`,
      [
        input.id,
        input.userId,
        input.sessionVersion,
        input.webAuthnCredentialId,
        input.mfaVerifiedAt,
        input.ipAddress,
        input.userAgent,
        input.expiresAt,
        input.userId,
        input.sessionVersion
      ]
    );

    return result.affectedRows > 0;
  }

  async isCommunitySessionActive(id: string, userId: number): Promise<boolean> {
    const [rows] = await this.db.execute(
      `SELECT 1 AS One
       FROM CommunitySessions
       WHERE Id = ?
         AND CommunityUserId = ?
         AND RevokedAt IS NULL
         AND ExpiresAt > CURRENT_TIMESTAMP
       LIMIT 1`,
      [id, userId]
    );

    return firstOrNull(rows as ActiveSessionRow[]) !== null;
  }

  async isStaffSessionActive(id: string, userId: number): Promise<boolean> {
    const [rows] = await this.db.execute(
      `SELECT 1 AS One
       FROM StaffSessions AS session
       INNER JOIN StaffProfiles AS profile
         ON profile.UserId = session.StaffUserId
        AND profile.SessionVersion = session.SessionVersion
       WHERE session.Id = ?
         AND session.StaffUserId = ?
         AND profile.Status = 'active'
         AND session.RevokedAt IS NULL
         AND session.ExpiresAt > CURRENT_TIMESTAMP
         AND session.MfaVerifiedAt IS NOT NULL
         AND session.WebAuthnCredentialId IS NOT NULL
         AND session.MfaMethod = 'webauthn'
         AND EXISTS (
           SELECT 1
           FROM StaffRoles AS role
           WHERE role.StaffUserId = session.StaffUserId
         )
       LIMIT 1`,
      [id, userId]
    );

    return firstOrNull(rows as ActiveSessionRow[]) !== null;
  }

  async isStaffSessionRecentlyAuthenticated(id: string, userId: number, authenticatedAfter: Date): Promise<boolean> {
    const [rows] = await this.db.execute(
      `SELECT 1 AS One
       FROM StaffSessions AS session
       INNER JOIN StaffProfiles AS profile
         ON profile.UserId = session.StaffUserId
        AND profile.SessionVersion = session.SessionVersion
       WHERE session.Id = ?
         AND session.StaffUserId = ?
         AND profile.Status = 'active'
         AND session.RevokedAt IS NULL
         AND session.ExpiresAt > CURRENT_TIMESTAMP
         AND session.MfaVerifiedAt >= ?
         AND session.WebAuthnCredentialId IS NOT NULL
         AND session.MfaMethod = 'webauthn'
         AND EXISTS (
           SELECT 1
           FROM StaffRoles AS role
           WHERE role.StaffUserId = session.StaffUserId
         )
       LIMIT 1`,
      [id, userId, authenticatedAfter]
    );

    return firstOrNull(rows as ActiveSessionRow[]) !== null;
  }

  async findActiveStaffSessionsByUserId(userId: number, db?: PoolConnection): Promise<StaffSession[]> {
    const [rows] = await (db ?? this.db).execute(
      `SELECT session.Id, session.MfaMethod, session.MfaVerifiedAt, session.IpAddress,
              session.UserAgent, session.ExpiresAt, session.CreatedAt
       FROM StaffSessions AS session
       INNER JOIN StaffProfiles AS profile
         ON profile.UserId = session.StaffUserId
        AND profile.SessionVersion = session.SessionVersion
       WHERE session.StaffUserId = ?
         AND profile.Status = 'active'
         AND session.RevokedAt IS NULL
         AND session.ExpiresAt > CURRENT_TIMESTAMP
         AND session.MfaVerifiedAt IS NOT NULL
         AND session.WebAuthnCredentialId IS NOT NULL
         AND session.MfaMethod = 'webauthn'
         AND EXISTS (
           SELECT 1
           FROM StaffRoles AS role
           WHERE role.StaffUserId = session.StaffUserId
         )
       ORDER BY session.CreatedAt DESC, session.Id DESC`,
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
    await this.db.execute(
      `UPDATE CommunitySessions
       SET RevokedAt = COALESCE(RevokedAt, CURRENT_TIMESTAMP),
           RevocationType = COALESCE(RevocationType, 'logout')
       WHERE Id = ? AND CommunityUserId = ?`,
      [id, userId]
    );
  }

  async revokeStaffSession(input: RevokeStaffSessionInput, db?: PoolConnection): Promise<boolean> {
    const [result] = await (db ?? this.db).execute<ResultSetHeader>(
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

}
