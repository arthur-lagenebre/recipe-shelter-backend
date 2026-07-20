import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { StaffMfaRepositoryMysql } from '../../../src/repositories/auth/staff-mfa.repository.mysql.js';

import type { Pool } from 'mysql2/promise';

type Statement = { sql: string; params: unknown };

function createPool(results: unknown[]) {
    const statements: Statement[] = [];
    let commits = 0;
    let rollbacks = 0;
    let releases = 0;
    const execute = async (sql: string, params: unknown) => {
        statements.push({ sql, params });
        return [results.shift() ?? [], []];
    };
    const connection = {
        execute,
        async beginTransaction() {},
        async commit() {
            commits += 1;
        },
        async rollback() {
            rollbacks += 1;
        },
        release() {
            releases += 1;
        }
    };
    const pool = {
        execute,
        async getConnection() {
            return connection;
        }
    } as unknown as Pool;

    return { pool, statements, counts: () => ({ commits, rollbacks, releases }) };
}

const challengeRow = {
    Id: 'flow-1',
    StaffUserId: 42,
    InvitationId: 7,
    SessionVersion: 1,
    Challenge: 'challenge',
    ExpiresAt: new Date('2026-07-16T12:05:00.000Z')
};

describe('StaffMfaRepositoryMysql', () => {
    it('accepts enrollment only for an unused, unexpired MFA invitation and an invited staff identity', async () => {
        const fake = createPool([
            [
                {
                    InvitationId: 7,
                    StaffUserId: 42,
                    Mail: 'staff@example.com',
                    Username: 'staff-user'
                }
            ]
        ]);
        const repository = new StaffMfaRepositoryMysql(fake.pool);

        assert.deepEqual(await repository.findEnrollmentContext('token-hash'), {
            invitationId: 7,
            staffUserId: 42,
            mail: 'staff@example.com',
            username: 'staff-user'
        });
        assert.match(fake.statements[0]?.sql ?? '', /si\.UsedAt IS NULL/);
        assert.match(fake.statements[0]?.sql ?? '', /si\.ExpiresAt > CURRENT_TIMESTAMP/);
        assert.match(fake.statements[0]?.sql ?? '', /si\.RequiresMfa = TRUE/);
        assert.match(fake.statements[0]?.sql ?? '', /sp\.Status = 'invited'/);
        assert.match(fake.statements[0]?.sql ?? '', /u\.Password IS NULL/);
    });

    it('invalidates an older ceremony before persisting the new short-lived challenge', async () => {
        const fake = createPool([{ affectedRows: 1 }, { affectedRows: 1 }]);
        const repository = new StaffMfaRepositoryMysql(fake.pool);

        await repository.saveChallenge({
            id: 'flow-1',
            staffUserId: 42,
            invitationId: null,
            purpose: 'authentication',
            expectedSessionVersion: 3,
            challenge: 'challenge',
            ttlMs: 300_000
        });

        assert.match(fake.statements[0]?.sql ?? '', /UPDATE StaffWebAuthnChallenges[\s\S]+ConsumedAt/);
        assert.match(fake.statements[1]?.sql ?? '', /INSERT INTO StaffWebAuthnChallenges[\s\S]+DATE_ADD\(CURRENT_TIMESTAMP/);
        assert.deepEqual(fake.statements[1]?.params, ['flow-1', 42, null, 'authentication', 'challenge', 300_000_000, 42, 3, 3]);
        assert.match(fake.statements[1]?.sql ?? '', /profile\.SessionVersion/);
        assert.deepEqual(fake.counts(), { commits: 1, rollbacks: 0, releases: 1 });
    });

    it('atomically persists the public credential, password, activation and invitation consumption', async () => {
        const fake = createPool([
            [challengeRow],
            { affectedRows: 1 },
            { affectedRows: 1 },
            { affectedRows: 1 },
            { affectedRows: 1 },
            { affectedRows: 1 }
        ]);
        const repository = new StaffMfaRepositoryMysql(fake.pool);

        assert.equal(
            await repository.completeEnrollment({
                challengeId: 'flow-1',
                invitationTokenHash: 'token-hash',
                passwordHash: 'password-hash',
                credential: {
                    credentialId: 'credential-1',
                    staffUserId: 42,
                    publicKey: new Uint8Array([1, 2]),
                    signatureCounter: 0,
                    transports: ['usb'],
                    deviceType: 'singleDevice',
                    backedUp: false,
                    aaguid: '00000000-0000-0000-0000-000000000000'
                }
            }),
            true
        );

        assert.match(fake.statements[0]?.sql ?? '', /FOR UPDATE/);
        assert.match(fake.statements[1]?.sql ?? '', /INSERT INTO StaffWebAuthnCredentials/);
        assert.match(fake.statements[2]?.sql ?? '', /SET MfaEnrolledAt = CURRENT_TIMESTAMP/);
        assert.match(fake.statements[3]?.sql ?? '', /Password = \?, Status = 'active'/);
        assert.match(fake.statements[4]?.sql ?? '', /StaffInvitations[\s\S]+UsedAt = CURRENT_TIMESTAMP/);
        assert.match(fake.statements[5]?.sql ?? '', /StaffWebAuthnChallenges[\s\S]+ConsumedAt = CURRENT_TIMESTAMP/);
        assert.deepEqual(fake.counts(), { commits: 1, rollbacks: 0, releases: 1 });
    });

    it('atomically advances the authenticator counter and consumes one authentication challenge', async () => {
        const fake = createPool([
            [{ ...challengeRow, InvitationId: null }],
            [{ SignatureCounter: 4 }],
            { affectedRows: 1 },
            { affectedRows: 1 }
        ]);
        const repository = new StaffMfaRepositoryMysql(fake.pool);

        assert.equal(
            await repository.completeAuthentication({
                challengeId: 'flow-1',
                staffUserId: 42,
                credentialId: 'credential-1',
                expectedCounter: 4,
                newCounter: 5
            }),
            true
        );
        assert.match(fake.statements[0]?.sql ?? '', /sp\.Status = 'active'[\s\S]+FOR UPDATE/);
        assert.match(fake.statements[1]?.sql ?? '', /SELECT SignatureCounter[\s\S]+FOR UPDATE/);
        assert.deepEqual(fake.statements[1]?.params, [42, 'credential-1']);
        assert.match(fake.statements[2]?.sql ?? '', /SET SignatureCounter = \?/);
        assert.deepEqual(fake.statements[2]?.params, [5, 42, 'credential-1']);
        assert.deepEqual(fake.counts(), { commits: 1, rollbacks: 0, releases: 1 });
    });

    it('rolls back a replayed or expired completion without activating the identity', async () => {
        const fake = createPool([[]]);
        const repository = new StaffMfaRepositoryMysql(fake.pool);

        assert.equal(
            await repository.completeEnrollment({
                challengeId: 'flow-1',
                invitationTokenHash: 'token-hash',
                passwordHash: 'password-hash',
                credential: { staffUserId: 42 } as never
            }),
            false
        );
        assert.equal(fake.statements.length, 1);
        assert.deepEqual(fake.counts(), { commits: 0, rollbacks: 1, releases: 1 });
    });
});
