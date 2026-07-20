import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import mysql from 'mysql2/promise';

import { SessionRepositoryMysql } from '../../../src/repositories/auth/session.repository.mysql.js';
import { StaffMfaRepositoryMysql } from '../../../src/repositories/auth/staff-mfa.repository.mysql.js';
import { PERMISSIONS } from '../../../src/security/permissions.js';
import { env } from '../../../src/utils/env.js';

import type { CompleteStaffMfaEnrollmentInput } from '../../../src/repositories/auth/staff-mfa.repository.interface.js';

const baseTestDatabaseName = process.env.TEST_DB_NAME?.trim() ?? '';
const mysqlEnabled = Boolean(baseTestDatabaseName);

function requireRbacTestDatabaseName(): string {
    if (!/^[a-zA-Z0-9_]+$/.test(baseTestDatabaseName)) throw new Error('TEST_DB_NAME must contain only letters, numbers and underscores');
    if (!baseTestDatabaseName.toLowerCase().includes('test')) throw new Error('TEST_DB_NAME must contain "test"');
    if (baseTestDatabaseName === env.db.name) throw new Error('TEST_DB_NAME must be different from DB_NAME');

    const databaseName = `${baseTestDatabaseName}_rbac`;
    if (databaseName.length > 64) throw new Error('TEST_DB_NAME is too long for the RBAC integration database suffix');
    return databaseName;
}

function targetDatabase(sql: string, databaseName: string): string {
    return sql.replace(/USE\s+recipe_shelter\s*;/i, `USE \`${databaseName}\`;`);
}

describe('RBAC schema and seed integration', { skip: !mysqlEnabled && 'Set TEST_DB_NAME to run isolated MySQL tests' }, () => {
    let connection: mysql.Connection;
    let pool: mysql.Pool;
    let seed: string;

    before(async () => {
        const databaseName = requireRbacTestDatabaseName();
        connection = await mysql.createConnection({
            host: env.db.host,
            port: env.db.port,
            user: env.db.user,
            password: env.db.password,
            multipleStatements: true
        });

        await connection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
        await connection.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

        const schemaPath = new URL('../../../database/migrations/1_create_schema.sql', import.meta.url);
        const seedPath = new URL('../../../database/seed.sql', import.meta.url);
        const schema = targetDatabase(await readFile(schemaPath, 'utf8'), databaseName);
        seed = targetDatabase(await readFile(seedPath, 'utf8'), databaseName);

        await connection.query(schema);
        await connection.query(seed);
        pool = mysql.createPool({
            host: env.db.host,
            port: env.db.port,
            user: env.db.user,
            password: env.db.password,
            database: databaseName,
            connectionLimit: 2,
            timezone: 'Z'
        });
    });

    after(async () => {
        if (connection) {
            if (pool) await pool.end();
            await connection.query(`DROP DATABASE IF EXISTS \`${requireRbacTestDatabaseName()}\``);
            await connection.end();
        }
    });

    it('bootstraps the final RBAC model from an empty database', async () => {
        const databaseName = requireRbacTestDatabaseName();
        const [tables] = await connection.query(
            `SELECT TABLE_NAME AS TableName
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ?
               AND TABLE_NAME IN ('Roles', 'Permissions', 'StaffRoles', 'RolePermissions')
             ORDER BY TABLE_NAME`,
            [databaseName]
        );
        assert.deepEqual(
            (tables as Array<{ TableName: string }>).map((row) => row.TableName.toLowerCase()),
            ['permissions', 'rolepermissions', 'roles', 'staffroles']
        );

        const [legacyRoleColumns] = await connection.query(`SHOW COLUMNS FROM Users WHERE Field = 'RoleId'`);
        assert.deepEqual(legacyRoleColumns, []);

        const [roles] = await connection.query(
            `SELECT Code, Name, Description
             FROM Roles
             ORDER BY Code`
        );
        assert.deepEqual(roles, [
            {
                Code: 'CatalogManager',
                Name: 'Gestionnaire du catalogue',
                Description: 'Gère les catégories, ingrédients, tags et ustensiles'
            },
            {
                Code: 'CommentModerator',
                Name: 'Modérateur de commentaires',
                Description: 'Examine, masque, restaure et modifie les commentaires'
            },
            {
                Code: 'RecipeModerator',
                Name: 'Modérateur de recettes',
                Description: 'Examine, approuve, rejette et archive les recettes'
            },
            {
                Code: 'SuperAdmin',
                Name: 'Super administrateur',
                Description: 'Dispose explicitement de toutes les permissions administratives'
            },
            {
                Code: 'UserAdmin',
                Name: 'Administrateur des utilisateurs',
                Description: 'Consulte, suspend et réactive les comptes utilisateurs'
            }
        ]);

        const [permissions] = await connection.query(
            `SELECT Code, Description
             FROM Permissions
             ORDER BY Code`
        );
        assert.deepEqual(
            (permissions as Array<{ Code: string }>).map(({ Code }) => Code),
            [...Object.values(PERMISSIONS)].sort()
        );
        assert.ok((permissions as Array<{ Description: string }>).every(({ Description }) => Description.trim().length > 0));

        const [rolePermissions] = await connection.query(
            `SELECT r.Code AS RoleCode, p.Code AS PermissionCode
             FROM RolePermissions AS rp
             INNER JOIN Roles AS r ON r.Id = rp.RoleId
             INNER JOIN Permissions AS p ON p.Id = rp.PermissionId
             ORDER BY r.Code, p.Code`
        );
        const permissionsByRole: Record<string, string[]> = {};
        for (const { RoleCode, PermissionCode } of rolePermissions as Array<{ RoleCode: string; PermissionCode: string }>)
            (permissionsByRole[RoleCode] ??= []).push(PermissionCode);
        assert.deepEqual(permissionsByRole, {
            CatalogManager: [
                PERMISSIONS.catalogManage,
                PERMISSIONS.catalogRead,
                PERMISSIONS.ingredientAliasManage,
                PERMISSIONS.ingredientCreate,
                PERMISSIONS.ingredientDeprecate,
                PERMISSIONS.ingredientMerge,
                PERMISSIONS.ingredientRead,
                PERMISSIONS.ingredientUpdate,
                PERMISSIONS.tagCreate,
                PERMISSIONS.tagDeprecate,
                PERMISSIONS.tagMerge,
                PERMISSIONS.tagRead,
                PERMISSIONS.tagUpdate
            ],
            CommentModerator: [PERMISSIONS.commentHide, PERMISSIONS.commentRestore, PERMISSIONS.commentReview, PERMISSIONS.commentsUpdate],
            RecipeModerator: [PERMISSIONS.recipeArchive, PERMISSIONS.recipePublish, PERMISSIONS.recipeReject, PERMISSIONS.recipeReview],
            SuperAdmin: [...Object.values(PERMISSIONS)].sort(),
            UserAdmin: [PERMISSIONS.userBan, PERMISSIONS.userRead, PERMISSIONS.userUnban]
        });

        const [seededAccounts] = await connection.query(`SELECT COUNT(*) AS AccountCount FROM Users`);
        assert.deepEqual(seededAccounts, [{ AccountCount: 0 }]);

        const [seededRoleAssignments] = await connection.query(`SELECT COUNT(*) AS AssignmentCount FROM StaffRoles`);
        assert.deepEqual(seededRoleAssignments, [{ AssignmentCount: 0 }]);
    });

    it('replays the seed without duplicating RBAC data', async () => {
        await connection.query(seed);

        const [roleInstances] = await connection.query(
            `SELECT Code, COUNT(*) AS InstanceCount
             FROM Roles
             GROUP BY Code
             ORDER BY Code`
        );
        assert.deepEqual(roleInstances, [
            { Code: 'CatalogManager', InstanceCount: 1 },
            { Code: 'CommentModerator', InstanceCount: 1 },
            { Code: 'RecipeModerator', InstanceCount: 1 },
            { Code: 'SuperAdmin', InstanceCount: 1 },
            { Code: 'UserAdmin', InstanceCount: 1 }
        ]);

        const [staffRoleAssignments] = await connection.query(
            `SELECT COUNT(*) AS AssignmentCount
             FROM StaffRoles`
        );
        assert.deepEqual(staffRoleAssignments, [{ AssignmentCount: 0 }]);

        const [permissionInstances] = await connection.query(
            `SELECT Code, COUNT(*) AS InstanceCount
             FROM Permissions
             GROUP BY Code
             ORDER BY Code`
        );
        assert.deepEqual(
            permissionInstances,
            [...Object.values(PERMISSIONS)].sort().map((Code) => ({ Code, InstanceCount: 1 }))
        );

        const [superAdminPermissions] = await connection.query(
            `SELECT COUNT(*) AS PermissionCount
             FROM RolePermissions AS rp
             INNER JOIN Roles AS r ON r.Id = rp.RoleId
             WHERE r.Code = 'SuperAdmin'`
        );
        assert.deepEqual(superAdminPermissions, [{ PermissionCount: Object.values(PERMISSIONS).length }]);
    });

    it('restricts community content ownership to community profiles in a fresh schema', async () => {
        const databaseName = requireRbacTestDatabaseName();
        const [foreignKeys] = await connection.query(
            `SELECT TABLE_NAME AS TableName, REFERENCED_TABLE_NAME AS ReferencedTableName
             FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = ?
               AND CONSTRAINT_NAME IN ('recipes_user_FK', 'comments_user_FK', 'favorites_user_FK')
             ORDER BY TABLE_NAME`,
            [databaseName]
        );
        assert.deepEqual(
            (foreignKeys as Array<{ TableName: string; ReferencedTableName: string }>).map((row) => ({
                tableName: row.TableName.toLowerCase(),
                referencedTableName: row.ReferencedTableName.toLowerCase()
            })),
            [
                { tableName: 'comments', referencedTableName: 'communityprofiles' },
                { tableName: 'favorites', referencedTableName: 'communityprofiles' },
                { tableName: 'recipes', referencedTableName: 'communityprofiles' }
            ]
        );

        await connection.query(
            `INSERT INTO Users (Id, Mail, Username, Password, AccountType, Status) VALUES
                (110, 'community-content@test.local', 'community-content', 'hash', 'community', 'active'),
                (111, 'staff-content@test.local', 'staff-content', 'hash', 'staff', 'inactive');
             INSERT INTO RecipeCategories (Id, Name, Slug, IconName)
             VALUES (100, 'Community boundary', 'community-boundary', 'boundary');
             INSERT INTO Recipes (Id, UserId, CategoryId, Title, Slug, Description, PrepTimeMinutes, Servings)
             VALUES (200, 110, 100, 'Community recipe', 'community-recipe', 'Allowed owner', 5, 2);
             INSERT INTO Favorites (UserId, RecipeId) VALUES (110, 200);
             INSERT INTO Comments (RecipeId, UserId, Comment) VALUES (200, 110, 'Allowed author')`
        );

        await assert.rejects(() =>
            connection.query(
                `INSERT INTO Recipes (Id, UserId, CategoryId, Title, Slug, Description, PrepTimeMinutes, Servings)
             VALUES (201, 111, 100, 'Staff recipe', 'staff-recipe', 'Forbidden owner', 5, 2)`
            )
        );
        await assert.rejects(() => connection.query(`INSERT INTO Favorites (UserId, RecipeId) VALUES (111, 200)`));
        await assert.rejects(() =>
            connection.query(`INSERT INTO Comments (RecipeId, UserId, Comment) VALUES (200, 111, 'Forbidden author')`)
        );
    });

    it('enforces unique assignments, foreign keys and default deny', async () => {
        await connection.query(
            `INSERT INTO Users (Id, Mail, Username, Password, AccountType, Status) VALUES
                (100, 'community-rbac@test.local', 'community-rbac', 'hash', 'community', 'active'),
                (101, 'staff-rbac@test.local', 'staff-rbac', 'hash', 'staff', 'inactive')`
        );

        const [defaultRoles] = await connection.query(`SELECT RoleId FROM StaffRoles WHERE StaffUserId = 101`);
        assert.deepEqual(defaultRoles, []);

        await connection.query(`INSERT INTO StaffRoles (StaffUserId, RoleId) VALUES (101, 1), (101, 2)`);
        const [staffRoles] = await connection.query(`SELECT RoleId FROM StaffRoles WHERE StaffUserId = 101 ORDER BY RoleId`);
        assert.deepEqual(staffRoles, [{ RoleId: 1 }, { RoleId: 2 }]);

        await assert.rejects(() => connection.query(`INSERT INTO StaffRoles (StaffUserId, RoleId) VALUES (101, 1)`));
        await assert.rejects(() => connection.query(`INSERT INTO StaffRoles (StaffUserId, RoleId) VALUES (100, 1)`));
        await assert.rejects(() => connection.query(`INSERT INTO StaffRoles (StaffUserId, RoleId) VALUES (101, 999999)`));
        await assert.rejects(() => connection.query(`INSERT INTO RolePermissions (RoleId, PermissionId) VALUES (5, 1)`));
        await assert.rejects(() => connection.query(`INSERT INTO RolePermissions (RoleId, PermissionId) VALUES (1, 999999)`));
        await assert.rejects(() =>
            connection.query(
                `INSERT INTO Roles (Code, Name, Description)
             VALUES ('RECIPEMODERATOR', 'Autre rôle recettes', 'Duplicate code')`
            )
        );
        await assert.rejects(() =>
            connection.query(
                `INSERT INTO Roles (Code, Name, Description)
             VALUES ('OtherRecipeModerator', 'MODÉRATEUR DE RECETTES', 'Duplicate name')`
            )
        );
        await assert.rejects(() => connection.query(`INSERT INTO Permissions (Code, Description) VALUES ('USER.READ', 'Duplicate')`));
    });

    it('creates strictly separate session stores and requires WebAuthn before staff activation', async () => {
        const [sessionTables] = await connection.query(
            `SELECT TABLE_NAME AS TableName
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ?
               AND TABLE_NAME IN ('CommunitySessions', 'StaffSessions', 'StaffWebAuthnChallenges', 'StaffWebAuthnCredentials')
             ORDER BY TABLE_NAME`,
            [requireRbacTestDatabaseName()]
        );
        assert.deepEqual(
            (sessionTables as Array<{ TableName: string }>).map(({ TableName }) => TableName.toLowerCase()),
            ['communitysessions', 'staffsessions', 'staffwebauthnchallenges', 'staffwebauthncredentials']
        );

        await connection.query(
            `INSERT INTO Users (Id, Mail, Username, Password, AccountType, Status) VALUES
                (120, 'session-community@test.local', 'session-community', 'hash', 'community', 'active'),
                (121, 'session-staff@test.local', 'session-staff', 'hash', 'staff', 'inactive')`
        );

        await assert.rejects(() => connection.query(`UPDATE Users SET Status = 'active' WHERE Id = 121`));
        await assert.rejects(() =>
            connection.query(`UPDATE StaffProfiles SET MfaEnrolledAt = CURRENT_TIMESTAMP, Status = 'active' WHERE UserId = 121`)
        );
        await connection.query(
            `INSERT INTO StaffWebAuthnCredentials
               (CredentialId, StaffUserId, PublicKey, SignatureCounter, Transports, DeviceType, BackedUp, Aaguid)
             VALUES ('credential-121', 121, 0x0102, 0, JSON_ARRAY('usb'), 'singleDevice', FALSE,
                     '00000000-0000-0000-0000-000000000000');
             UPDATE StaffProfiles
             SET MfaEnrolledAt = CURRENT_TIMESTAMP
             WHERE UserId = 121;
             INSERT INTO StaffRoles (StaffUserId, RoleId)
             SELECT 121, Id FROM Roles WHERE Code = 'UserAdmin';
             UPDATE Users SET Status = 'active' WHERE Id = 121`
        );

        await connection.query(
            `INSERT INTO CommunitySessions (Id, CommunityUserId, ExpiresAt)
             VALUES ('00000000-0000-4000-8000-000000000120', 120, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 DAY));
             INSERT INTO StaffSessions
               (Id, StaffUserId, WebAuthnCredentialId, MfaVerifiedAt, IpAddress, UserAgent, ExpiresAt)
             VALUES ('00000000-0000-4000-8000-000000000121', 121, 'credential-121', CURRENT_TIMESTAMP,
                     '192.0.2.121', 'Recipe Shelter schema test',
                     DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 8 HOUR))`
        );

        await assert.rejects(() =>
            connection.query(
                `INSERT INTO CommunitySessions (Id, CommunityUserId, ExpiresAt)
             VALUES ('00000000-0000-4000-8000-000000000122', 121, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 DAY))`
            )
        );
        await assert.rejects(() =>
            connection.query(
                `INSERT INTO StaffSessions (Id, StaffUserId, WebAuthnCredentialId, MfaVerifiedAt, ExpiresAt)
             VALUES ('00000000-0000-4000-8000-000000000123', 120, 'credential-121', CURRENT_TIMESTAMP,
                     DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 8 HOUR))`
            )
        );
        await assert.rejects(() =>
            connection.query(
                `INSERT INTO StaffSessions (Id, StaffUserId, WebAuthnCredentialId, MfaVerifiedAt, ExpiresAt)
             VALUES ('00000000-0000-4000-8000-000000000124', 121, 'unknown-credential', CURRENT_TIMESTAMP,
                     DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 8 HOUR))`
            )
        );
        await assert.rejects(() =>
            connection.query(
                `INSERT INTO StaffSessions (Id, StaffUserId, WebAuthnCredentialId, MfaVerifiedAt, ExpiresAt)
             VALUES ('00000000-0000-4000-8000-000000000125', 121, 'credential-121', NULL,
                     DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 8 HOUR))`
            )
        );
        await assert.rejects(() =>
            connection.query(
                `UPDATE StaffSessions
             SET RevokedByStaffUserId = 121, RevocationType = 'self'
             WHERE Id = '00000000-0000-4000-8000-000000000121'`
            )
        );

        const sessions = new SessionRepositoryMysql(pool);
        const activeSessions = await sessions.findActiveStaffSessionsByUserId(121);
        assert.equal(activeSessions.length, 1);
        assert.deepEqual(
            {
                id: activeSessions[0]?.id,
                mfaMethod: activeSessions[0]?.mfaMethod,
                ipAddress: activeSessions[0]?.ipAddress,
                userAgent: activeSessions[0]?.userAgent
            },
            {
                id: '00000000-0000-4000-8000-000000000121',
                mfaMethod: 'webauthn',
                ipAddress: '192.0.2.121',
                userAgent: 'Recipe Shelter schema test'
            }
        );
        assert.equal('webAuthnCredentialId' in (activeSessions[0] as unknown as Record<string, unknown>), false);
        assert.equal(
            await sessions.revokeStaffSession({
                id: '00000000-0000-4000-8000-000000000121',
                staffUserId: 121,
                revokedByStaffUserId: 121,
                revocationType: 'self'
            }),
            true
        );
        assert.deepEqual(await sessions.findActiveStaffSessionsByUserId(121), []);

        const [revokedSession] = await connection.query(
            `SELECT IpAddress, UserAgent, RevokedByStaffUserId, RevocationType
             FROM StaffSessions
             WHERE Id = '00000000-0000-4000-8000-000000000121'`
        );
        assert.deepEqual(revokedSession, [
            {
                IpAddress: '192.0.2.121',
                UserAgent: 'Recipe Shelter schema test',
                RevokedByStaffUserId: 121,
                RevocationType: 'self'
            }
        ]);
    });

    it('completes enrollment and authentication atomically through the WebAuthn repository', async () => {
        const repository = new StaffMfaRepositoryMysql(pool);
        const tokenHash = 'b'.repeat(64);

        await connection.query(
            `INSERT INTO Users (Id, Mail, Username, Password, AccountType, Status)
             VALUES (130, 'webauthn-staff@test.local', 'webauthn-staff', NULL, 'staff', 'inactive')`
        );
        await connection.query(
            `INSERT INTO StaffInvitations (StaffUserId, TokenHash, ExpiresAt)
             VALUES (130, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE))`,
            [tokenHash]
        );

        const context = await repository.findEnrollmentContext(tokenHash);
        assert.ok(context);
        await repository.saveChallenge({
            id: '00000000-0000-4000-8000-000000000130',
            staffUserId: 130,
            invitationId: context.invitationId,
            purpose: 'registration',
            expectedSessionVersion: null,
            challenge: 'registration-challenge-130',
            ttlMs: 300_000
        });
        const enrollmentInput: CompleteStaffMfaEnrollmentInput = {
            challengeId: '00000000-0000-4000-8000-000000000130',
            invitationTokenHash: tokenHash,
            passwordHash: 'password-hash',
            credential: {
                credentialId: 'credential-130',
                staffUserId: 130,
                publicKey: new Uint8Array([1, 2, 3]),
                signatureCounter: 0,
                transports: ['usb'],
                deviceType: 'singleDevice',
                backedUp: false,
                aaguid: '00000000-0000-0000-0000-000000000000'
            }
        };

        assert.equal(
            await repository.completeEnrollment({
                ...enrollmentInput,
                invitationTokenHash: 'c'.repeat(64)
            }),
            false
        );
        const [pendingRows] = await connection.query(
            `SELECT u.Password, sp.Status AS StaffStatus, sp.MfaEnrolledAt, si.UsedAt,
                    (SELECT COUNT(*) FROM StaffWebAuthnCredentials WHERE StaffUserId = 130) AS CredentialCount
             FROM Users AS u
             INNER JOIN StaffProfiles AS sp ON sp.UserId = u.Id
             INNER JOIN StaffInvitations AS si ON si.StaffUserId = u.Id
             WHERE u.Id = 130`
        );
        assert.deepEqual(pendingRows, [
            {
                Password: null,
                StaffStatus: 'invited',
                MfaEnrolledAt: null,
                UsedAt: null,
                CredentialCount: 0
            }
        ]);

        assert.equal(await repository.completeEnrollment(enrollmentInput), true);
        assert.equal(await repository.completeEnrollment(enrollmentInput), false);

        const [enrolledRows] = await connection.query(
            `SELECT u.Password, u.Status AS UserStatus, sp.Status AS StaffStatus,
                    sp.MfaEnrolledAt, si.UsedAt
             FROM Users AS u
             INNER JOIN StaffProfiles AS sp ON sp.UserId = u.Id
             INNER JOIN StaffInvitations AS si ON si.StaffUserId = u.Id
             WHERE u.Id = 130`
        );
        const enrolled = (
            enrolledRows as Array<{
                Password: string;
                UserStatus: string;
                StaffStatus: string;
                MfaEnrolledAt: Date | null;
                UsedAt: Date | null;
            }>
        )[0];
        assert.equal(enrolled?.Password, 'password-hash');
        assert.equal(enrolled?.UserStatus, 'active');
        assert.equal(enrolled?.StaffStatus, 'active');
        assert.ok(enrolled?.MfaEnrolledAt);
        assert.ok(enrolled?.UsedAt);

        await repository.saveChallenge({
            id: '00000000-0000-4000-8000-000000000131',
            staffUserId: 130,
            invitationId: null,
            purpose: 'authentication',
            expectedSessionVersion: 2,
            challenge: 'authentication-challenge-130',
            ttlMs: 300_000
        });
        assert.equal(
            await repository.completeAuthentication({
                challengeId: '00000000-0000-4000-8000-000000000131',
                staffUserId: 130,
                credentialId: 'credential-130',
                expectedCounter: 0,
                newCounter: 1
            }),
            true
        );
        assert.equal(
            await repository.completeAuthentication({
                challengeId: '00000000-0000-4000-8000-000000000131',
                staffUserId: 130,
                credentialId: 'credential-130',
                expectedCounter: 0,
                newCounter: 1
            }),
            false
        );

        const credential = await repository.findCredential(130, 'credential-130');
        assert.equal(credential?.signatureCounter, 1);
        assert.deepEqual(credential?.transports, ['usb']);
    });
});
