import { firstOrNull } from '../../utils/array.js';

import type { CompleteStaffMfaAuthenticationInput, CompleteStaffMfaEnrollmentInput, CreateStaffWebAuthnChallengeInput, StaffMfaEnrollmentContext, StaffMfaRepository, StaffWebAuthnChallenge, StaffWebAuthnCredential } from './staff-mfa.repository.interface.js';
import type { AuthenticatorTransportFuture, CredentialDeviceType } from '@simplewebauthn/server';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

type EnrollmentContextRow = RowDataPacket & {
  InvitationId: number;
  StaffUserId: number;
  Mail: string;
  Username: string;
};

type CredentialRow = RowDataPacket & {
  CredentialId: string;
  StaffUserId: number;
  PublicKey: Buffer;
  SignatureCounter: number | string;
  Transports: string | AuthenticatorTransportFuture[] | null;
  DeviceType: CredentialDeviceType;
  BackedUp: boolean | number;
  Aaguid: string;
};

type ChallengeRow = RowDataPacket & {
  Id: string;
  StaffUserId: number;
  InvitationId: number | null;
  Challenge: string;
  ExpiresAt: Date;
};

type CredentialCounterRow = RowDataPacket & {
  SignatureCounter: number | string;
};

export class StaffMfaRepositoryMysql implements StaffMfaRepository {
  constructor(private readonly db: Pool) { }

  async findEnrollmentContext(invitationTokenHash: string): Promise<StaffMfaEnrollmentContext | null> {
    const [rows] = await this.db.execute<EnrollmentContextRow[]>(
      `SELECT si.Id AS InvitationId, si.StaffUserId, u.Mail, u.Username
       FROM StaffInvitations AS si
       INNER JOIN StaffProfiles AS sp ON sp.UserId = si.StaffUserId
       INNER JOIN Users AS u ON u.Id = si.StaffUserId
       WHERE si.TokenHash = ?
         AND si.UsedAt IS NULL
         AND si.ExpiresAt > CURRENT_TIMESTAMP
         AND si.RequiresMfa = TRUE
         AND sp.Status = 'invited'
         AND sp.MfaEnrolledAt IS NULL
         AND u.AccountType = 'staff'
         AND u.Password IS NULL
       LIMIT 1`,
      [invitationTokenHash]
    );
    const row = firstOrNull(rows);

    return row ? {
      invitationId: Number(row.InvitationId),
      staffUserId: Number(row.StaffUserId),
      mail: row.Mail,
      username: row.Username
    } : null;
  }

  async findCredentialsByStaffUserId(staffUserId: number): Promise<StaffWebAuthnCredential[]> {
    const [rows] = await this.db.execute<CredentialRow[]>(
      `SELECT CredentialId, StaffUserId, PublicKey, SignatureCounter, Transports,
              DeviceType, BackedUp, Aaguid
       FROM StaffWebAuthnCredentials
       WHERE StaffUserId = ?
       ORDER BY CreatedAt ASC`,
      [staffUserId]
    );

    return rows.map(mapCredential);
  }

  async findCredential(staffUserId: number, credentialId: string): Promise<StaffWebAuthnCredential | null> {
    const [rows] = await this.db.execute<CredentialRow[]>(
      `SELECT CredentialId, StaffUserId, PublicKey, SignatureCounter, Transports,
              DeviceType, BackedUp, Aaguid
       FROM StaffWebAuthnCredentials
       WHERE StaffUserId = ? AND CredentialId = ?
       LIMIT 1`,
      [staffUserId, credentialId]
    );
    const row = firstOrNull(rows);

    return row ? mapCredential(row) : null;
  }

  async saveChallenge(input: CreateStaffWebAuthnChallengeInput): Promise<void> {
    const conn = await this.db.getConnection();

    try {
      await conn.beginTransaction();
      await conn.execute(
        `UPDATE StaffWebAuthnChallenges
         SET ConsumedAt = COALESCE(ConsumedAt, CURRENT_TIMESTAMP)
         WHERE StaffUserId = ? AND Purpose = ? AND ConsumedAt IS NULL`,
        [input.staffUserId, input.purpose]
      );
      await conn.execute(
        `INSERT INTO StaffWebAuthnChallenges
           (Id, StaffUserId, InvitationId, Purpose, Challenge, ExpiresAt)
         VALUES (?, ?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MICROSECOND))`,
        [
          input.id,
          input.staffUserId,
          input.invitationId,
          input.purpose,
          input.challenge,
          input.ttlMs * 1000
        ]
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async findRegistrationChallenge(id: string, invitationTokenHash: string): Promise<StaffWebAuthnChallenge | null> {
    return this.findChallenge(
      `SELECT c.Id, c.StaffUserId, c.InvitationId, c.Challenge, c.ExpiresAt
       FROM StaffWebAuthnChallenges AS c
       INNER JOIN StaffInvitations AS si
         ON si.Id = c.InvitationId AND si.StaffUserId = c.StaffUserId
       WHERE c.Id = ?
         AND c.Purpose = 'registration'
         AND c.ConsumedAt IS NULL
         AND c.ExpiresAt > CURRENT_TIMESTAMP
         AND si.TokenHash = ?
         AND si.UsedAt IS NULL
         AND si.ExpiresAt > CURRENT_TIMESTAMP
       LIMIT 1`,
      [id, invitationTokenHash]
    );
  }

  async findAuthenticationChallenge(id: string): Promise<StaffWebAuthnChallenge | null> {
    return this.findChallenge(
      `SELECT c.Id, c.StaffUserId, c.InvitationId, c.Challenge, c.ExpiresAt
       FROM StaffWebAuthnChallenges AS c
       INNER JOIN StaffProfiles AS sp ON sp.UserId = c.StaffUserId
       WHERE c.Id = ?
         AND c.Purpose = 'authentication'
         AND c.ConsumedAt IS NULL
         AND c.ExpiresAt > CURRENT_TIMESTAMP
         AND sp.Status = 'active'
         AND sp.MfaEnrolledAt IS NOT NULL
       LIMIT 1`,
      [id]
    );
  }

  async completeEnrollment(input: CompleteStaffMfaEnrollmentInput): Promise<boolean> {
    const conn = await this.db.getConnection();

    try {
      await conn.beginTransaction();
      const [challengeRows] = await conn.execute<ChallengeRow[]>(
        `SELECT c.Id, c.StaffUserId, c.InvitationId, c.Challenge, c.ExpiresAt
         FROM StaffWebAuthnChallenges AS c
         INNER JOIN StaffInvitations AS si
           ON si.Id = c.InvitationId AND si.StaffUserId = c.StaffUserId
         INNER JOIN StaffProfiles AS sp ON sp.UserId = c.StaffUserId
         INNER JOIN Users AS u ON u.Id = c.StaffUserId
         WHERE c.Id = ?
           AND c.Purpose = 'registration'
           AND c.ConsumedAt IS NULL
           AND c.ExpiresAt > CURRENT_TIMESTAMP
           AND si.TokenHash = ?
           AND si.UsedAt IS NULL
           AND si.ExpiresAt > CURRENT_TIMESTAMP
           AND sp.Status = 'invited'
           AND sp.MfaEnrolledAt IS NULL
           AND u.AccountType = 'staff'
           AND u.Password IS NULL
         FOR UPDATE`,
        [input.challengeId, input.invitationTokenHash]
      );
      const challenge = firstOrNull(challengeRows);

      if (!challenge || Number(challenge.StaffUserId) !== input.credential.staffUserId) {
        await conn.rollback();
        return false;
      }

      await conn.execute(
        `INSERT INTO StaffWebAuthnCredentials
           (CredentialId, StaffUserId, PublicKey, SignatureCounter, Transports,
            DeviceType, BackedUp, Aaguid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.credential.credentialId,
          input.credential.staffUserId,
          Buffer.from(input.credential.publicKey),
          input.credential.signatureCounter,
          JSON.stringify(input.credential.transports),
          input.credential.deviceType,
          input.credential.backedUp,
          input.credential.aaguid
        ]
      );
      const [profileResult] = await conn.execute<ResultSetHeader>(
        `UPDATE StaffProfiles
         SET MfaEnrolledAt = CURRENT_TIMESTAMP
         WHERE UserId = ? AND Status = 'invited' AND MfaEnrolledAt IS NULL`,
        [input.credential.staffUserId]
      );
      const [userResult] = await conn.execute<ResultSetHeader>(
        `UPDATE Users
         SET Password = ?, Status = 'active', EmailValidatedAt = COALESCE(EmailValidatedAt, CURRENT_TIMESTAMP)
         WHERE Id = ? AND AccountType = 'staff' AND Password IS NULL`,
        [input.passwordHash, input.credential.staffUserId]
      );
      const [invitationResult] = await conn.execute<ResultSetHeader>(
        `UPDATE StaffInvitations
         SET UsedAt = CURRENT_TIMESTAMP
         WHERE Id = ? AND StaffUserId = ? AND UsedAt IS NULL`,
        [challenge.InvitationId, input.credential.staffUserId]
      );
      const [challengeResult] = await conn.execute<ResultSetHeader>(
        `UPDATE StaffWebAuthnChallenges
         SET ConsumedAt = CURRENT_TIMESTAMP
         WHERE Id = ? AND ConsumedAt IS NULL`,
        [input.challengeId]
      );

      if (
        profileResult.affectedRows !== 1
        || userResult.affectedRows !== 1
        || invitationResult.affectedRows !== 1
        || challengeResult.affectedRows !== 1
      ) {
        await conn.rollback();
        return false;
      }

      await conn.commit();
      return true;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async completeAuthentication(input: CompleteStaffMfaAuthenticationInput): Promise<boolean> {
    const conn = await this.db.getConnection();

    try {
      await conn.beginTransaction();
      const [challengeRows] = await conn.execute<ChallengeRow[]>(
        `SELECT c.Id, c.StaffUserId, c.InvitationId, c.Challenge, c.ExpiresAt
         FROM StaffWebAuthnChallenges AS c
         INNER JOIN StaffProfiles AS sp ON sp.UserId = c.StaffUserId
         WHERE c.Id = ?
           AND c.StaffUserId = ?
           AND c.Purpose = 'authentication'
           AND c.ConsumedAt IS NULL
           AND c.ExpiresAt > CURRENT_TIMESTAMP
           AND sp.Status = 'active'
           AND sp.MfaEnrolledAt IS NOT NULL
         FOR UPDATE`,
        [input.challengeId, input.staffUserId]
      );

      if (!firstOrNull(challengeRows)) {
        await conn.rollback();
        return false;
      }

      const [credentialRows] = await conn.execute<CredentialCounterRow[]>(
        `SELECT SignatureCounter
         FROM StaffWebAuthnCredentials
         WHERE StaffUserId = ? AND CredentialId = ?
         FOR UPDATE`,
        [input.staffUserId, input.credentialId]
      );
      const credential = firstOrNull(credentialRows);

      if (!credential || Number(credential.SignatureCounter) !== input.expectedCounter) {
        await conn.rollback();
        return false;
      }

      await conn.execute(
        `UPDATE StaffWebAuthnCredentials
         SET SignatureCounter = ?, LastUsedAt = CURRENT_TIMESTAMP
         WHERE StaffUserId = ?
           AND CredentialId = ?`,
        [input.newCounter, input.staffUserId, input.credentialId]
      );

      const [challengeResult] = await conn.execute<ResultSetHeader>(
        `UPDATE StaffWebAuthnChallenges
         SET ConsumedAt = CURRENT_TIMESTAMP
         WHERE Id = ? AND ConsumedAt IS NULL`,
        [input.challengeId]
      );

      if (challengeResult.affectedRows !== 1) {
        await conn.rollback();
        return false;
      }

      await conn.commit();
      return true;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  private async findChallenge(sql: string, values: (number | string)[]): Promise<StaffWebAuthnChallenge | null> {
    const [rows] = await this.db.execute<ChallengeRow[]>(sql, values);
    const row = firstOrNull(rows);

    return row ? {
      id: row.Id,
      staffUserId: Number(row.StaffUserId),
      invitationId: row.InvitationId === null ? null : Number(row.InvitationId),
      challenge: row.Challenge,
      expiresAt: row.ExpiresAt
    } : null;
  }
}

function mapCredential(row: CredentialRow): StaffWebAuthnCredential {
  const transports = typeof row.Transports === 'string' ? JSON.parse(row.Transports) as AuthenticatorTransportFuture[] : row.Transports ?? [];

  return {
    credentialId: row.CredentialId,
    staffUserId: Number(row.StaffUserId),
    publicKey: Uint8Array.from(row.PublicKey),
    signatureCounter: Number(row.SignatureCounter),
    transports,
    deviceType: row.DeviceType,
    backedUp: Boolean(row.BackedUp),
    aaguid: row.Aaguid
  };
}
