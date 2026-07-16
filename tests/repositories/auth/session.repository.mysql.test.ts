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
      return [active && /^SELECT/.test(sql.trim()) ? [{ One: 1 }] : [], []];
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
    await repository.createStaffSession({
      id: 'staff-id',
      userId: 1,
      expiresAt,
      webAuthnCredentialId: 'credential-id',
      mfaVerifiedAt
    });

    assert.match(fake.statements[0]?.sql ?? '', /INSERT INTO CommunitySessions/);
    assert.deepEqual(fake.statements[0]?.params, ['community-id', 2, expiresAt]);
    assert.match(fake.statements[1]?.sql ?? '', /INSERT INTO StaffSessions[\s\S]+WebAuthnCredentialId[\s\S]+MfaVerifiedAt/);
    assert.deepEqual(fake.statements[1]?.params, ['staff-id', 1, 'credential-id', mfaVerifiedAt, expiresAt]);
  });

  it('checks expiry, revocation and MFA for the matching session realm', async () => {
    const fake = createPool();
    const repository = new SessionRepositoryMysql(fake.pool);

    assert.equal(await repository.isCommunitySessionActive('community-id', 2), true);
    assert.equal(await repository.isStaffSessionActive('staff-id', 1), true);

    assert.match(fake.statements[0]?.sql ?? '', /FROM CommunitySessions[\s\S]+RevokedAt IS NULL[\s\S]+ExpiresAt > CURRENT_TIMESTAMP/);
    assert.match(fake.statements[1]?.sql ?? '', /FROM StaffSessions[\s\S]+MfaVerifiedAt IS NOT NULL[\s\S]+MfaMethod = 'webauthn'/);
  });

  it('revokes only the id and owner in the selected session table', async () => {
    const fake = createPool(false);
    const repository = new SessionRepositoryMysql(fake.pool);

    await repository.revokeCommunitySession('community-id', 2);
    await repository.revokeStaffSession('staff-id', 1);

    assert.match(fake.statements[0]?.sql ?? '', /UPDATE CommunitySessions/);
    assert.deepEqual(fake.statements[0]?.params, ['community-id', 2]);
    assert.match(fake.statements[1]?.sql ?? '', /UPDATE StaffSessions/);
    assert.deepEqual(fake.statements[1]?.params, ['staff-id', 1]);
  });
});
