import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SessionRepositoryMysql } from '../../../src/repositories/auth/session.repository.mysql.js';

import type { Pool } from 'mysql2/promise';

type Statement = { sql: string; params: unknown[] };

function createPool(active = true) {
  const statements: Statement[] = [];
  const pool = {
    async execute(sql: string, params: unknown[]) {
      statements.push({ sql, params });
      if (/^SELECT 1/.test(sql.trim()))
        return [active ? [{ One: 1 }] : [], []];
      if (/^SELECT session\.Id/.test(sql.trim())) {
        return [[{
          Id: 'staff-id',
          MfaMethod: 'webauthn',
          MfaVerifiedAt: new Date('2026-07-16T10:00:00.000Z'),
          IpAddress: '192.0.2.10',
          UserAgent: 'Recipe Shelter test client',
          ExpiresAt: new Date('2026-07-17T10:00:00.000Z'),
          CreatedAt: new Date('2026-07-16T10:00:01.000Z')
        }], []];
      }

      return [{ affectedRows: active ? 1 : 0 }, []];
    }
  } as unknown as Pool;

  return { pool, statements };
}

describe('SessionRepositoryMysql', () => {
  it('persists community and MFA-backed staff sessions in separate tables', async () => {
    const fake = createPool();
    const repository = new SessionRepositoryMysql(fake.pool);
    const expiresAt = new Date('2026-07-17T10:00:00.000Z');
    const mfaVerifiedAt = new Date('2026-07-16T10:00:00.000Z');

    await repository.createCommunitySession({ id: 'community-id', userId: 2, expiresAt });
    assert.equal(await repository.createStaffSession({
      id: 'staff-id',
      userId: 1,
      sessionVersion: 7,
      expiresAt,
      webAuthnCredentialId: 'credential-id',
      mfaVerifiedAt,
      ipAddress: '192.0.2.10',
      userAgent: 'Recipe Shelter test client'
    }), true);

    assert.match(fake.statements[0]?.sql ?? '', /INSERT INTO CommunitySessions/);
    assert.deepEqual(fake.statements[0]?.params, ['community-id', 2, expiresAt]);
    assert.match(fake.statements[1]?.sql ?? '', /INSERT INTO StaffSessions[\s\S]+WebAuthnCredentialId[\s\S]+IpAddress[\s\S]+UserAgent/);
    assert.deepEqual(fake.statements[1]?.params, [
      'staff-id',
      1,
      7,
      'credential-id',
      mfaVerifiedAt,
      '192.0.2.10',
      'Recipe Shelter test client',
      expiresAt,
      1,
      7
    ]);
    assert.match(fake.statements[1]?.sql ?? '', /FROM StaffProfiles[\s\S]+Status = 'active'[\s\S]+SessionVersion = \?[\s\S]+FROM StaffRoles/);
  });

  it('lists only active MFA-backed staff sessions without selecting credential secrets', async () => {
    const fake = createPool();
    const repository = new SessionRepositoryMysql(fake.pool);

    const sessions = await repository.findActiveStaffSessionsByUserId(1);

    assert.deepEqual(sessions, [{
      id: 'staff-id',
      mfaMethod: 'webauthn',
      mfaVerifiedAt: new Date('2026-07-16T10:00:00.000Z'),
      ipAddress: '192.0.2.10',
      userAgent: 'Recipe Shelter test client',
      expiresAt: new Date('2026-07-17T10:00:00.000Z'),
      createdAt: new Date('2026-07-16T10:00:01.000Z')
    }]);
    assert.deepEqual(fake.statements[0]?.params, [1]);
    assert.match(fake.statements[0]?.sql ?? '', /FROM StaffSessions[\s\S]+RevokedAt IS NULL[\s\S]+ExpiresAt > CURRENT_TIMESTAMP/);
    assert.doesNotMatch(fake.statements[0]?.sql ?? '', /SELECT[\s\S]*WebAuthnCredentialId,/);
  });

  it('checks expiry, revocation and MFA for the matching session realm', async () => {
    const fake = createPool();
    const repository = new SessionRepositoryMysql(fake.pool);

    assert.equal(await repository.isCommunitySessionActive('community-id', 2), true);
    assert.equal(await repository.isStaffSessionActive('staff-id', 1), true);

    assert.match(fake.statements[0]?.sql ?? '', /FROM CommunitySessions[\s\S]+RevokedAt IS NULL[\s\S]+ExpiresAt > CURRENT_TIMESTAMP/);
    assert.match(fake.statements[1]?.sql ?? '', /FROM StaffSessions[\s\S]+MfaVerifiedAt IS NOT NULL[\s\S]+MfaMethod = 'webauthn'/);
    assert.match(fake.statements[1]?.sql ?? '', /profile\.SessionVersion = session\.SessionVersion[\s\S]+FROM StaffRoles/);
  });

  it('checks recent strong authentication on the exact active staff session', async () => {
    const fake = createPool();
    const repository = new SessionRepositoryMysql(fake.pool);
    const authenticatedAfter = new Date('2026-07-17T09:55:00.000Z');

    assert.equal(
      await repository.isStaffSessionRecentlyAuthenticated('staff-id', 1, authenticatedAfter),
      true
    );
    assert.deepEqual(fake.statements[0]?.params, ['staff-id', 1, authenticatedAfter]);
    assert.match(
      fake.statements[0]?.sql ?? '',
      /FROM StaffSessions[\s\S]+RevokedAt IS NULL[\s\S]+ExpiresAt > CURRENT_TIMESTAMP[\s\S]+MfaVerifiedAt >= \?[\s\S]+MfaMethod = 'webauthn'/
    );
  });

  it('revokes only the id and owner in the selected session table', async () => {
    const fake = createPool(false);
    const repository = new SessionRepositoryMysql(fake.pool);

    await repository.revokeCommunitySession('community-id', 2);
    const revoked = await repository.revokeStaffSession({
      id: 'staff-id',
      staffUserId: 1,
      revokedByStaffUserId: 9,
      revocationType: 'suspected_compromise'
    });

    assert.match(fake.statements[0]?.sql ?? '', /UPDATE CommunitySessions/);
    assert.match(fake.statements[0]?.sql ?? '', /RevocationType = COALESCE\(RevocationType, 'logout'\)/);
    assert.deepEqual(fake.statements[0]?.params, ['community-id', 2]);
    assert.match(fake.statements[1]?.sql ?? '', /UPDATE StaffSessions/);
    assert.match(fake.statements[1]?.sql ?? '', /RevokedByStaffUserId = \?[\s\S]+RevocationType = \?/);
    assert.deepEqual(fake.statements[1]?.params, [9, 'suspected_compromise', 'staff-id', 1]);
    assert.equal(revoked, false);
  });
});
