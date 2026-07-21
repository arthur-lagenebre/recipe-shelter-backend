import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import mysql from 'mysql2/promise';

import { SessionRepositoryMysql } from '../../../src/repositories/auth/session.repository.mysql.js';
import { StaffMfaRepositoryMysql } from '../../../src/repositories/auth/staff-mfa.repository.mysql.js';
import { env } from '../../../src/utils/env.js';

const baseTestDatabaseName = process.env.TEST_DB_NAME?.trim() ?? '';
const mysqlEnabled = Boolean(baseTestDatabaseName);

function requireTestDatabaseName(): string {
    if (!/^[a-zA-Z0-9_]+$/.test(baseTestDatabaseName))
        throw new Error('TEST_DB_NAME must contain only letters, numbers and underscores');
    if (!baseTestDatabaseName.toLowerCase().includes('test'))
        throw new Error('TEST_DB_NAME must contain "test"');
    if (baseTestDatabaseName === env.db.name)
        throw new Error('TEST_DB_NAME must be different from DB_NAME');

    const databaseName = `${baseTestDatabaseName}_staff_session_revocation`;
    if (databaseName.length > 64)
        throw new Error('TEST_DB_NAME is too long for the staff session revocation suffix');
    return databaseName;
}

function targetDatabase(sql: string, databaseName: string): string {
    return sql.replace(/USE\s+recipe_shelter\s*;/i, `USE \`${databaseName}\`;`);
}

describe(
    'automatic staff session revocation MySQL integration',
    { skip: !mysqlEnabled && 'Set TEST_DB_NAME to run isolated MySQL tests' },
    () => {
        let adminConnection: mysql.Connection;
        let pool: mysql.Pool;
        let sessions: SessionRepositoryMysql;
        let identitySequence = 0;

        before(async () => {
            const databaseName = requireTestDatabaseName();
            adminConnection = await mysql.createConnection({
                host: env.db.host,
                port: env.db.port,
                user: env.db.user,
                password: env.db.password,
                multipleStatements: true
            });
            await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
            await adminConnection.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

            const schemaPath = new URL('../../../database/migrations/1_create_schema.sql', import.meta.url);
            const seedPath = new URL('../../../database/seed.sql', import.meta.url);
            const schema = targetDatabase(await readFile(schemaPath, 'utf8'), databaseName);
            const seed = targetDatabase(await readFile(seedPath, 'utf8'), databaseName);
            await adminConnection.query(schema);
            await adminConnection.query(seed);

            pool = mysql.createPool({
                host: env.db.host,
                port: env.db.port,
                user: env.db.user,
                password: env.db.password,
                database: databaseName,
                connectionLimit: 3,
                timezone: 'Z'
            });
            sessions = new SessionRepositoryMysql(pool);
        });

        after(async () => {
            if (pool)
                await pool.end();
            if (adminConnection) {
                await adminConnection.query(`DROP DATABASE IF EXISTS \`${requireTestDatabaseName()}\``);
                await adminConnection.end();
            }
        });

        it('lets the application preserve a community session while staff password changes revoke automatically', async () => {
            const community = await createCommunityIdentity('password-community');
            const otherCommunitySessionId = randomUUID();
            const staff = await createStaffIdentity('password-staff', ['UserAdmin']);
            const staffMfa = new StaffMfaRepositoryMysql(pool);
            const flowId = randomUUID();

            await staffMfa.saveChallenge({
                id: flowId,
                staffUserId: staff.userId,
                invitationId: null,
                purpose: 'authentication',
                expectedSessionVersion: 1,
                challenge: 'password-change-race-challenge',
                ttlMs: 300_000
            });
            const challenge = await staffMfa.findAuthenticationChallenge(flowId);
            assert.equal(challenge?.sessionVersion, 1);

            await pool.execute(`UPDATE Users SET Password = Password WHERE Id = ?`, [staff.userId]);
            assert.equal(await sessions.isStaffSessionActive(staff.sessionId, staff.userId), true);

            await pool.execute(`INSERT INTO CommunitySessions (Id, CommunityUserId, ExpiresAt) VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 HOUR))`, [otherCommunitySessionId, community.userId]);

            await pool.execute(`UPDATE Users SET Password = 'new-community-password-hash' WHERE Id = ?`, [community.userId]);
            await sessions.revokeAllCommunitySessions(community.userId, 'password_changed', community.sessionId);
            assert.equal(await sessions.isCommunitySessionActive(community.sessionId, community.userId), true);
            assert.equal(await sessions.isCommunitySessionActive(otherCommunitySessionId, community.userId), false);
            assert.equal(await sessions.isStaffSessionActive(staff.sessionId, staff.userId), true);

            await pool.execute(`UPDATE Users SET Password = 'new-staff-password-hash' WHERE Id = ?`, [staff.userId]);
            assert.equal(await sessions.isStaffSessionActive(staff.sessionId, staff.userId), false);
            assert.equal(await staffMfa.findAuthenticationChallenge(flowId), null);
            assert.equal(
                await staffMfa.saveChallenge({
                    id: randomUUID(),
                    staffUserId: staff.userId,
                    invitationId: null,
                    purpose: 'authentication',
                    expectedSessionVersion: challenge!.sessionVersion,
                    challenge: 'stale-password-proof-challenge',
                    ttlMs: 300_000
                }),
                false
            );
            assert.equal(
                await sessions.createStaffSession({
                    id: randomUUID(),
                    userId: staff.userId,
                    sessionVersion: challenge!.sessionVersion,
                    webAuthnCredentialId: staff.credentialId,
                    mfaVerifiedAt: new Date(),
                    ipAddress: '192.0.2.11',
                    userAgent: 'Stale MFA flow integration test',
                    expiresAt: new Date(Date.now() + 60_000)
                }),
                false
            );

            const [communityRevocation] = await pool.query(`SELECT RevocationType FROM CommunitySessions WHERE Id = ?`, [
                otherCommunitySessionId
            ]);
            const [staffRevocation] = await pool.query(`SELECT RevokedByStaffUserId, RevocationType FROM StaffSessions WHERE Id = ?`, [
                staff.sessionId
            ]);
            assert.deepEqual(communityRevocation, [{ RevocationType: 'password_changed' }]);
            assert.deepEqual(staffRevocation, [
                {
                    RevokedByStaffUserId: null,
                    RevocationType: 'password_changed'
                }
            ]);
        });

        it('revokes all sessions immediately after disablement, lock or MFA reset', async () => {
            const actor = await createStaffIdentity('security-actor', ['UserAdmin']);
            const disabled = await createStaffIdentity('disabled-target', ['RecipeModerator']);
            const locked = await createStaffIdentity('locked-target', ['RecipeModerator']);
            const mfaReset = await createStaffIdentity('mfa-reset-target', ['RecipeModerator']);

            await pool.execute(`UPDATE StaffProfiles SET Status = 'disabled', DisabledByStaffUserId = ?, DisabledReason = 'Confirmed staff access deactivation.', DisabledAt = CURRENT_TIMESTAMP WHERE UserId = ?`, [actor.userId, disabled.userId]);
            await pool.execute(`UPDATE StaffProfiles SET Status = 'locked' WHERE UserId = ?`, [locked.userId]);
            await pool.execute(`UPDATE StaffProfiles SET Status = 'locked', MfaEnrolledAt = NULL WHERE UserId = ?`, [mfaReset.userId]);

            assert.equal(await sessions.isStaffSessionActive(disabled.sessionId, disabled.userId), false);
            assert.equal(await sessions.isStaffSessionActive(locked.sessionId, locked.userId), false);
            assert.equal(await sessions.isStaffSessionActive(mfaReset.sessionId, mfaReset.userId), false);
            assert.equal(await sessions.isStaffSessionActive(actor.sessionId, actor.userId), true);

            const [revocations] = await pool.query(`SELECT StaffUserId, RevokedByStaffUserId, RevocationType FROM StaffSessions WHERE StaffUserId IN (?, ?, ?) ORDER BY StaffUserId`, [disabled.userId, locked.userId, mfaReset.userId]);
            assert.deepEqual(revocations, [
                {
                    StaffUserId: disabled.userId,
                    RevokedByStaffUserId: actor.userId,
                    RevocationType: 'account_disabled'
                },
                {
                    StaffUserId: locked.userId,
                    RevokedByStaffUserId: null,
                    RevocationType: 'account_locked'
                },
                {
                    StaffUserId: mfaReset.userId,
                    RevokedByStaffUserId: null,
                    RevocationType: 'mfa_reset'
                }
            ]);
        });

        it('keeps sessions while a role remains and revokes them when the last role is removed', async () => {
            const staff = await createStaffIdentity('roles-target', ['RecipeModerator', 'UserAdmin']);

            await pool.execute(`DELETE sr FROM StaffRoles AS sr INNER JOIN Roles AS role ON role.Id = sr.RoleId WHERE sr.StaffUserId = ? AND role.Code = 'RecipeModerator'`, [staff.userId]);
            assert.equal(await sessions.isStaffSessionActive(staff.sessionId, staff.userId), true);

            await pool.execute(`DELETE FROM StaffRoles WHERE StaffUserId = ?`, [staff.userId]);
            assert.equal(await sessions.isStaffSessionActive(staff.sessionId, staff.userId), false);

            const [revocation] = await pool.query(`SELECT RevokedByStaffUserId, RevocationType FROM StaffSessions WHERE Id = ?`, [
                staff.sessionId
            ]);
            assert.deepEqual(revocation, [
                {
                    RevokedByStaffUserId: null,
                    RevocationType: 'roles_removed'
                }
            ]);
        });

        it('revokes a suspected compromised session without affecting other staff sessions', async () => {
            const actor = await createStaffIdentity('suspicion-actor', ['UserAdmin']);
            const target = await createStaffIdentity('suspicion-target', ['RecipeModerator']);

            assert.equal(
                await sessions.revokeStaffSession({
                    id: target.sessionId,
                    staffUserId: target.userId,
                    revokedByStaffUserId: actor.userId,
                    revocationType: 'suspected_compromise'
                }),
                true
            );

            assert.equal(await sessions.isStaffSessionActive(target.sessionId, target.userId), false);
            assert.equal(await sessions.isStaffSessionActive(actor.sessionId, actor.userId), true);

            const [revocation] = await pool.query(`SELECT RevokedByStaffUserId, RevocationType FROM StaffSessions WHERE Id = ?`, [
                target.sessionId
            ]);
            assert.deepEqual(revocation, [
                {
                    RevokedByStaffUserId: actor.userId,
                    RevocationType: 'suspected_compromise'
                }
            ]);
        });

        async function createCommunityIdentity(label: string) {
            identitySequence += 1;
            const [result] = await pool.execute<mysql.ResultSetHeader>(`INSERT INTO Users (Mail, Username, Password, AccountType, Status, EmailValidatedAt) VALUES (?, ?, 'community-password-hash', 'community', 'active', CURRENT_TIMESTAMP)`, [`${label}-${identitySequence}@test.local`, `${label}-${identitySequence}`]);
            const userId = Number(result.insertId);
            const sessionId = randomUUID();
            await pool.execute(`INSERT INTO CommunitySessions (Id, CommunityUserId, ExpiresAt) VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 HOUR))`, [sessionId, userId]);
            return { userId, sessionId };
        }

        async function createStaffIdentity(label: string, roleCodes: string[]) {
            identitySequence += 1;
            const suffix = identitySequence;
            const [result] = await pool.execute<mysql.ResultSetHeader>(`INSERT INTO Users (Mail, Username, Password, AccountType, Status, EmailValidatedAt) VALUES (?, ?, 'staff-password-hash', 'staff', 'inactive', CURRENT_TIMESTAMP)`, [`${label}-${suffix}@test.local`, `${label}-${suffix}`]);
            const userId = Number(result.insertId);
            const credentialId = `${label}-${suffix}-credential`;
            const sessionId = randomUUID();

            for (const roleCode of roleCodes) {
                await pool.execute(`INSERT INTO StaffRoles (StaffUserId, RoleId) SELECT ?, Id FROM Roles WHERE Code = ?`, [userId, roleCode]);
            }
            await pool.execute(`INSERT INTO StaffWebAuthnCredentials (CredentialId, StaffUserId, PublicKey, SignatureCounter, DeviceType, BackedUp, Aaguid) VALUES (?, ?, 0x0102, 0, 'singleDevice', FALSE, '00000000-0000-0000-0000-000000000000')`, [credentialId, userId]);
            await pool.execute(`UPDATE StaffProfiles SET MfaEnrolledAt = CURRENT_TIMESTAMP WHERE UserId = ?`, [userId]);
            await pool.execute(`UPDATE Users SET Status = 'active' WHERE Id = ?`, [userId]);
            await pool.execute(`INSERT INTO StaffSessions (Id, StaffUserId, WebAuthnCredentialId, MfaVerifiedAt, IpAddress, UserAgent, ExpiresAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP, '192.0.2.10', 'Automatic revocation integration test', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 HOUR))`, [sessionId, userId, credentialId]);
            return { userId, sessionId, credentialId };
        }
    }
);
