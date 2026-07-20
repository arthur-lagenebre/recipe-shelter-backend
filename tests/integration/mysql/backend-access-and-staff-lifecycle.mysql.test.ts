import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';
import mysql from 'mysql2/promise';

import { createAdminCatalogProposalsRouter } from '../../../src/api/admin/admin.catalog-proposals.routes.js';
import { createAdminStaffController } from '../../../src/api/admin/admin.staff.controller.js';
import { createAdminStaffRouter } from '../../../src/api/admin/admin.staff.routes.js';
import { adminAuthorizationPolicies } from '../../../src/api/admin/admin.authorization.js';
import { createStaffInvitationsController } from '../../../src/api/admin/admin.staff-invitations.controller.js';
import { createStaffInvitationsRouter } from '../../../src/api/admin/admin.staff-invitations.routes.js';
import { createStaffSessionsController } from '../../../src/api/admin/admin.staff-sessions.controller.js';
import { createAdminStaffSessionsRouter } from '../../../src/api/admin/admin.staff-sessions.routes.js';
import { createStaffAuthRouter } from '../../../src/api/auth/auth.routes.js';
import { createHealthRouter } from '../../../src/api/health/health.routes.js';
import { EnforceAuthorizationPolicies } from '../../../src/middlewares/authorization.js';
import { errorHandler } from '../../../src/middlewares/error-handler.js';
import {
    configureAuthRbacRepository,
    configureAuthSessionRepository,
    configureAuthUserRepository,
    requireStaffAuth
} from '../../../src/middlewares/require-auth.js';
import { AdminStaffRepositoryMysql } from '../../../src/repositories/admin/admin.staff.repository.mysql.js';
import { AdminAuditRepositoryMysql } from '../../../src/repositories/admin/admin.audit.repository.mysql.js';
import { StaffInvitationRepositoryMysql } from '../../../src/repositories/admin/admin.staff-invitation.repository.mysql.js';
import { SessionRepositoryMysql } from '../../../src/repositories/auth/session.repository.mysql.js';
import { StaffMfaRepositoryMysql } from '../../../src/repositories/auth/staff-mfa.repository.mysql.js';
import { RbacRepositoryMysql } from '../../../src/repositories/rbac/rbac.repository.mysql.js';
import { UserRepositoryMysql } from '../../../src/repositories/users/user.repository.mysql.js';
import { PERMISSIONS } from '../../../src/security/permissions.js';
import { AdminStaffService } from '../../../src/services/admin/admin.staff.service.js';
import { AdminAuditService } from '../../../src/services/admin/admin.audit.service.js';
import { AdminAuditActionRunnerMysql } from '../../../src/services/admin/admin.audit-action.runner.js';
import { StaffInvitationService } from '../../../src/services/admin/admin.staff-invitation.service.js';
import { signSessionToken } from '../../../src/services/auth/session-token.js';
import { StaffSessionService } from '../../../src/services/auth/staff-session.service.js';
import { env } from '../../../src/utils/env.js';
import { adminSessionCookieName, appSessionCookieName } from '../../../src/utils/session-cookie.js';
import { startHttpTestServer } from '../../helpers/http-test-server.js';

import type { User } from '../../../src/repositories/users/user.types.js';
import type { CompleteStaffMfaEnrollmentInput } from '../../../src/repositories/auth/staff-mfa.repository.interface.js';
import type { PermissionCode } from '../../../src/security/permissions.js';
import type { StaffInvitationMailInput } from '../../../src/services/mail/mail.types.js';
import type { HttpTestServer } from '../../helpers/http-test-server.js';
import type { RequestHandler } from 'express';
import type { RowDataPacket } from 'mysql2';

const baseTestDatabaseName = process.env.TEST_DB_NAME?.trim() ?? '';
const mysqlEnabled = Boolean(baseTestDatabaseName);
const STAFF_FIXTURE_IDS = {
    RecipeModerator: 101,
    CommentModerator: 102,
    UserAdmin: 103,
    CatalogManager: 104,
    SuperAdmin: 105
} as const;
const NO_ROLE_STAFF_ID = 106;
const DISABLED_STAFF_ID = 107;
const ROLE_REVOKED_STAFF_ID = 108;
const COMMUNITY_USER_ID = 109;
const INVITATION_TOKEN_HASH = 'c'.repeat(64);

type SeededRoleCode = keyof typeof STAFF_FIXTURE_IDS;
type AccessEndpoint = {
    method: 'DELETE' | 'GET' | 'PATCH' | 'POST';
    path: string;
    requiredPermissions: readonly PermissionCode[];
};
type IssuedStaffSession = { cookie: string; id: string };

const EXPECTED_PERMISSIONS_BY_ROLE: Record<SeededRoleCode, readonly PermissionCode[]> = {
    RecipeModerator: [PERMISSIONS.recipeReview, PERMISSIONS.recipePublish, PERMISSIONS.recipeReject, PERMISSIONS.recipeArchive],
    CommentModerator: [PERMISSIONS.commentReview, PERMISSIONS.commentHide, PERMISSIONS.commentRestore, PERMISSIONS.commentsUpdate],
    UserAdmin: [PERMISSIONS.userRead, PERMISSIONS.userBan, PERMISSIONS.userUnban],
    CatalogManager: [
        PERMISSIONS.catalogRead,
        PERMISSIONS.catalogManage,
        PERMISSIONS.tagRead,
        PERMISSIONS.tagCreate,
        PERMISSIONS.tagUpdate,
        PERMISSIONS.tagDeprecate,
        PERMISSIONS.tagMerge,
        PERMISSIONS.ingredientRead,
        PERMISSIONS.ingredientCreate,
        PERMISSIONS.ingredientUpdate,
        PERMISSIONS.ingredientDeprecate,
        PERMISSIONS.ingredientMerge,
        PERMISSIONS.ingredientAliasManage
    ],
    SuperAdmin: Object.values(PERMISSIONS)
};

const ADDITIONAL_ROUTE_PERMISSIONS: Readonly<Record<string, readonly PermissionCode[]>> = {
    '/catalog-proposals/tags/:id/accept': [PERMISSIONS.tagCreate],
    '/catalog-proposals/ingredients/:id/accept': [PERMISSIONS.ingredientCreate],
    '/catalog-proposals/ingredients/:id/alias': [PERMISSIONS.ingredientAliasManage]
};

const ACCESS_ENDPOINTS: readonly AccessEndpoint[] = [
    ...adminAuthorizationPolicies.map((policy) => ({
        method: policy.method.toUpperCase() as AccessEndpoint['method'],
        path: `/api/v1/admin${materializePolicyPath(policy.path)}`,
        requiredPermissions: [policy.permission, ...(ADDITIONAL_ROUTE_PERMISSIONS[policy.path] ?? [])]
    })),
    { method: 'GET', path: '/api/v1/health/live', requiredPermissions: [PERMISSIONS.systemHealthRead] },
    { method: 'GET', path: '/api/v1/health/ready', requiredPermissions: [PERMISSIONS.systemHealthRead] },
    { method: 'GET', path: '/api/v1/health', requiredPermissions: [PERMISSIONS.systemHealthRead] }
];

describe(
    'backend access matrix and staff lifecycle integration',
    { skip: !mysqlEnabled && 'Set TEST_DB_NAME to run isolated MySQL tests' },
    () => {
        let connection: mysql.Connection;
        let pool: mysql.Pool;
        let matrixServer: HttpTestServer;
        let lifecycleServer: HttpTestServer;
        let users: UserRepositoryMysql;
        let rbac: RbacRepositoryMysql;
        let sessions: SessionRepositoryMysql;
        let staff: AdminStaffRepositoryMysql;
        let staffMfa: StaffMfaRepositoryMysql;
        let cleanSeedUserCount = -1;
        let sessionSequence = 0;
        let actorCookie: string;
        let staleActorCookie: string;
        let noRoleCookie: string;
        let communityCookie: string;
        let disabledCookie: string;
        let disabledSessionId: string;
        let roleRevokedCookie: string;
        let roleRevokedSessionId: string;
        let noRoleSessionCreated = true;
        const roleCookies = new Map<SeededRoleCode, string>();
        const invitationMessages: StaffInvitationMailInput[] = [];

        before(async () => {
            const databaseName = requireBackendIntegrationDatabaseName();
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
            await connection.query(targetDatabase(await readFile(schemaPath, 'utf8'), databaseName));
            await connection.query(targetDatabase(await readFile(seedPath, 'utf8'), databaseName));
            const [seededUsers] = await connection.query<RowDataPacket[]>(`SELECT COUNT(*) AS UserCount FROM Users`);
            cleanSeedUserCount = Number(seededUsers[0]?.UserCount);

            pool = mysql.createPool({
                host: env.db.host,
                port: env.db.port,
                user: env.db.user,
                password: env.db.password,
                database: databaseName,
                connectionLimit: 6,
                timezone: 'Z'
            });
            users = new UserRepositoryMysql(pool);
            rbac = new RbacRepositoryMysql(pool);
            sessions = new SessionRepositoryMysql(pool);
            staff = new AdminStaffRepositoryMysql(pool);
            staffMfa = new StaffMfaRepositoryMysql(pool);
            configureAuthUserRepository(users);
            configureAuthRbacRepository(rbac);
            configureAuthSessionRepository(sessions);

            for (const [roleCode, staffUserId] of Object.entries(STAFF_FIXTURE_IDS) as Array<[SeededRoleCode, number]>) {
                await createActiveStaffFixture(staffUserId, roleCode);
                roleCookies.set(roleCode, (await issueStaffSession(staffUserId)).cookie);
            }
            actorCookie = roleCookies.get('SuperAdmin')!;
            staleActorCookie = (
                await issueStaffSession(
                    STAFF_FIXTURE_IDS.SuperAdmin,
                    new Date(Date.now() - env.auth.staffMfa.reauthenticationMaxAgeMs - 60_000)
                )
            ).cookie;

            await createActiveStaffFixture(NO_ROLE_STAFF_ID, null);
            const noRoleUser = await requireUser(NO_ROLE_STAFF_ID);
            const noRoleSessionId = nextUuid(NO_ROLE_STAFF_ID);
            noRoleSessionCreated = await sessions.createStaffSession({
                id: noRoleSessionId,
                userId: NO_ROLE_STAFF_ID,
                sessionVersion: await findStaffSessionVersion(NO_ROLE_STAFF_ID),
                webAuthnCredentialId: `credential-${NO_ROLE_STAFF_ID}`,
                mfaVerifiedAt: new Date(),
                ipAddress: '192.0.2.106',
                userAgent: 'Recipe Shelter integration no-role client',
                expiresAt: new Date(Date.now() + 28_800_000)
            });
            noRoleCookie = createCookie(noRoleUser, 'admin', noRoleSessionId);

            await createActiveStaffFixture(DISABLED_STAFF_ID, 'RecipeModerator');
            const disabledSession = await issueStaffSession(DISABLED_STAFF_ID);
            disabledCookie = disabledSession.cookie;
            disabledSessionId = disabledSession.id;
            await pool.execute(
                `UPDATE StaffProfiles
       SET Status = 'disabled', DisabledByStaffUserId = ?,
           DisabledReason = 'Security fixture disabled for integration coverage.',
           DisabledAt = CURRENT_TIMESTAMP
       WHERE UserId = ?`,
                [STAFF_FIXTURE_IDS.SuperAdmin, DISABLED_STAFF_ID]
            );

            await createActiveStaffFixture(ROLE_REVOKED_STAFF_ID, 'RecipeModerator');
            const roleRevokedSession = await issueStaffSession(ROLE_REVOKED_STAFF_ID);
            roleRevokedCookie = roleRevokedSession.cookie;
            roleRevokedSessionId = roleRevokedSession.id;
            await pool.execute(`DELETE FROM StaffRoles WHERE StaffUserId = ?`, [ROLE_REVOKED_STAFF_ID]);

            await pool.execute(
                `INSERT INTO Users (Id, Mail, Username, Password, AccountType, Status, EmailValidatedAt)
       VALUES (?, 'community-matrix@test.invalid', 'community-matrix', 'test-password-hash',
               'community', 'active', CURRENT_TIMESTAMP)`,
                [COMMUNITY_USER_ID]
            );
            const community = await requireUser(COMMUNITY_USER_ID);
            const communitySessionId = nextUuid(COMMUNITY_USER_ID);
            await sessions.createCommunitySession({
                id: communitySessionId,
                userId: COMMUNITY_USER_ID,
                expiresAt: new Date(Date.now() + 28_800_000)
            });
            communityCookie = createCookie(community, 'app', communitySessionId);

            matrixServer = await startHttpTestServer(createAccessMatrixApp());
            lifecycleServer = await startHttpTestServer(createStaffLifecycleApp());
        });

        after(async () => {
            if (matrixServer) await matrixServer.close();
            if (lifecycleServer) await lifecycleServer.close();
            if (pool) await pool.end();
            if (connection) {
                await connection.query(`DROP DATABASE IF EXISTS \`${requireBackendIntegrationDatabaseName()}\``);
                await connection.end();
            }
        });

        it('applies schema then the central seed and enforces every seeded role across every protected endpoint', async () => {
            assert.equal(cleanSeedUserCount, 0);

            for (const roleCode of Object.keys(STAFF_FIXTURE_IDS) as SeededRoleCode[]) {
                const expectedPermissions = [...EXPECTED_PERMISSIONS_BY_ROLE[roleCode]].sort();
                assert.deepEqual(await rbac.findPermissionCodesByStaffUserId(STAFF_FIXTURE_IDS[roleCode]), expectedPermissions);

                for (const endpoint of ACCESS_ENDPOINTS) {
                    const expectedAllowed = endpoint.requiredPermissions.every((permission) => expectedPermissions.includes(permission));
                    const response = await callEndpoint(matrixServer, endpoint, roleCookies.get(roleCode)!);
                    const scenario = `${roleCode} ${endpoint.method} ${endpoint.path}`;
                    assert.equal(response.status, expectedAllowed ? 204 : 403, scenario);
                    if (!expectedAllowed) assert.equal(await responseErrorCode(response), 'AUTH_PERMISSION_REQUIRED', scenario);
                }
            }
        });

        it('denies identities outside the matrix and rejects disabled or role-revoked sessions immediately', async () => {
            assert.equal(noRoleSessionCreated, false);

            for (const endpoint of ACCESS_ENDPOINTS) {
                const noRoleResponse = await callEndpoint(matrixServer, endpoint, noRoleCookie);
                assert.equal(noRoleResponse.status, 401, `no role ${endpoint.method} ${endpoint.path}`);
                assert.equal(await responseErrorCode(noRoleResponse), 'AUTH_BAD_TOKEN');

                const communityResponse = await callEndpoint(matrixServer, endpoint, communityCookie);
                assert.equal(communityResponse.status, 401, `community ${endpoint.method} ${endpoint.path}`);
                assert.equal(await responseErrorCode(communityResponse), 'AUTH_NO_TOKEN');
            }

            for (const [label, cookie] of [
                ['disabled staff', disabledCookie],
                ['staff without its last role', roleRevokedCookie]
            ] as const) {
                const response = await fetch(`${matrixServer.baseUrl}/api/v1/admin/recipes/pending`, {
                    headers: { cookie }
                });
                assert.equal(response.status, 401, label);
                assert.equal(await responseErrorCode(response), 'AUTH_BAD_TOKEN', label);
            }

            const [rows] = await pool.execute<RowDataPacket[]>(
                `SELECT Id, RevocationType, RevokedByStaffUserId
       FROM StaffSessions WHERE Id IN (?, ?) ORDER BY Id`,
                [disabledSessionId, roleRevokedSessionId]
            );
            const actual = rows.map((row) => ({
                id: row.Id as string,
                revocationType: row.RevocationType as string,
                revokedByStaffUserId: row.RevokedByStaffUserId === null ? null : Number(row.RevokedByStaffUserId)
            }));
            const expected = [
                {
                    id: disabledSessionId,
                    revocationType: 'account_disabled',
                    revokedByStaffUserId: STAFF_FIXTURE_IDS.SuperAdmin
                },
                {
                    id: roleRevokedSessionId,
                    revocationType: 'roles_removed',
                    revokedByStaffUserId: null
                }
            ].sort((left, right) => left.id.localeCompare(right.id));
            assert.deepEqual(actual, expected);
        });

        it('runs the complete staff lifecycle and applies every global or targeted revocation immediately', async () => {
            const invitationResponse = await lifecycleRequest('/api/v1/admin/staff/invitations', {
                method: 'POST',
                cookie: actorCookie,
                body: {
                    email: 'lifecycle-staff@test.invalid',
                    displayName: 'Lifecycle Staff',
                    roles: ['RecipeModerator']
                }
            });
            assert.equal(invitationResponse.status, 201);
            const invitation = (await invitationResponse.json()) as {
                id: number;
                staffUserId: number;
                status: string;
                roles: Array<{ code: string }>;
            };
            assert.equal(invitation.status, 'invited');
            assert.deepEqual(
                invitation.roles.map((role) => role.code),
                ['RecipeModerator']
            );
            assert.equal(invitationMessages.length, 1);
            assert.match(invitationMessages[0]?.invitationUrl ?? '', /token=integration-invitation-token$/);

            const invitedUser = await requireUser(invitation.staffUserId);
            const invitedSessionId = nextUuid(invitation.staffUserId);
            assert.equal(
                await sessions.createStaffSession({
                    id: invitedSessionId,
                    userId: invitation.staffUserId,
                    sessionVersion: await findStaffSessionVersion(invitation.staffUserId),
                    webAuthnCredentialId: 'missing-before-enrollment',
                    mfaVerifiedAt: new Date(),
                    ipAddress: '192.0.2.110',
                    userAgent: 'Recipe Shelter invited staff client',
                    expiresAt: new Date(Date.now() + 28_800_000)
                }),
                false
            );
            const invitedAccess = await fetch(`${matrixServer.baseUrl}/api/v1/admin/recipes/pending`, {
                headers: { cookie: createCookie(invitedUser, 'admin', invitedSessionId) }
            });
            assert.equal(invitedAccess.status, 401);
            assert.equal(await responseErrorCode(invitedAccess), 'AUTH_BAD_TOKEN');

            const invalidInvitedDisable = await lifecycleRequest(`/api/v1/admin/staff/${invitation.staffUserId}/disable`, {
                method: 'POST',
                cookie: actorCookie,
                body: { reason: 'Invited staff cannot be disabled before activation.' }
            });
            assert.equal(invalidInvitedDisable.status, 409);
            assert.equal(await responseErrorCode(invalidInvitedDisable), 'STAFF_DISABLE_INVALID_STATUS');

            const enrollment = await staffMfa.findEnrollmentContext(INVITATION_TOKEN_HASH);
            assert.ok(enrollment);
            assert.equal(enrollment.staffUserId, invitation.staffUserId);
            const challengeId = nextUuid(invitation.staffUserId);
            assert.equal(
                await staffMfa.saveChallenge({
                    id: challengeId,
                    staffUserId: invitation.staffUserId,
                    invitationId: invitation.id,
                    purpose: 'registration',
                    expectedSessionVersion: null,
                    challenge: 'staff-lifecycle-registration-challenge',
                    ttlMs: 300_000
                }),
                true
            );
            const enrollmentInput: CompleteStaffMfaEnrollmentInput = {
                challengeId,
                invitationTokenHash: INVITATION_TOKEN_HASH,
                passwordHash: 'activated-test-password-hash',
                credential: {
                    credentialId: `credential-${invitation.staffUserId}`,
                    staffUserId: invitation.staffUserId,
                    publicKey: new Uint8Array([1, 2, 3]),
                    signatureCounter: 0,
                    transports: ['internal'],
                    deviceType: 'singleDevice' as const,
                    backedUp: false,
                    aaguid: '00000000-0000-0000-0000-000000000000'
                }
            };
            assert.equal(await staffMfa.completeEnrollment(enrollmentInput), true);
            assert.equal(await staffMfa.completeEnrollment(enrollmentInput), false);
            assert.equal((await requireUser(invitation.staffUserId)).status, 'active');

            const targetSessionOne = await issueStaffSession(invitation.staffUserId);
            const targetSessionTwo = await issueStaffSession(invitation.staffUserId);
            const crossRoleRead = await lifecycleRequest(`/api/v1/admin/staff/${invitation.staffUserId}`, {
                cookie: targetSessionOne.cookie
            });
            assert.equal(crossRoleRead.status, 403);
            assert.equal(await responseErrorCode(crossRoleRead), 'AUTH_PERMISSION_REQUIRED');

            const targetDetails = await lifecycleRequest(`/api/v1/admin/staff/${invitation.staffUserId}`, { cookie: actorCookie });
            assert.equal(targetDetails.status, 200);
            assert.equal(((await targetDetails.json()) as { status: string }).status, 'active');

            const grantUserAdmin = await lifecycleRequest(`/api/v1/admin/staff/${invitation.staffUserId}/roles/UserAdmin`, {
                method: 'POST',
                cookie: actorCookie,
                body: { reason: 'Temporary user administration coverage is approved.' }
            });
            assert.equal(grantUserAdmin.status, 200);
            assert.deepEqual(await responseRoleCodes(grantUserAdmin), ['RecipeModerator', 'UserAdmin']);
            const newlyGrantedAccess = await fetch(`${matrixServer.baseUrl}/api/v1/admin/users/banned`, {
                headers: { cookie: targetSessionOne.cookie }
            });
            assert.equal(newlyGrantedAccess.status, 204);

            const revokeRecipeModerator = await lifecycleRequest(`/api/v1/admin/staff/${invitation.staffUserId}/roles/RecipeModerator`, {
                method: 'DELETE',
                cookie: actorCookie,
                body: { reason: 'Recipe moderation coverage is no longer required.' }
            });
            assert.equal(revokeRecipeModerator.status, 200);
            assert.deepEqual(await responseRoleCodes(revokeRecipeModerator), ['UserAdmin']);
            assert.equal(await sessions.isStaffSessionActive(targetSessionOne.id, invitation.staffUserId), true);
            assert.equal(await sessions.isStaffSessionActive(targetSessionTwo.id, invitation.staffUserId), true);

            const revokeLastRole = await lifecycleRequest(`/api/v1/admin/staff/${invitation.staffUserId}/roles/UserAdmin`, {
                method: 'DELETE',
                cookie: actorCookie,
                body: { reason: 'All temporary staff responsibilities have ended.' }
            });
            assert.equal(revokeLastRole.status, 200);
            assert.deepEqual(await responseRoleCodes(revokeLastRole), []);
            assert.equal(await sessions.isStaffSessionActive(targetSessionOne.id, invitation.staffUserId), false);
            assert.equal(await sessions.isStaffSessionActive(targetSessionTwo.id, invitation.staffUserId), false);
            const revokedRoleCookieAccess = await fetch(`${matrixServer.baseUrl}/api/v1/admin/users/banned`, {
                headers: { cookie: targetSessionOne.cookie }
            });
            assert.equal(revokedRoleCookieAccess.status, 401);
            assert.equal(await responseErrorCode(revokedRoleCookieAccess), 'AUTH_BAD_TOKEN');

            const [lastRoleRevocations] = await pool.execute<RowDataPacket[]>(
                `SELECT RevocationType FROM StaffSessions WHERE Id IN (?, ?) ORDER BY Id`,
                [targetSessionOne.id, targetSessionTwo.id]
            );
            assert.deepEqual(
                lastRoleRevocations.map((row) => row.RevocationType),
                ['roles_removed', 'roles_removed']
            );

            const restoreRecipeModerator = await lifecycleRequest(`/api/v1/admin/staff/${invitation.staffUserId}/roles/RecipeModerator`, {
                method: 'POST',
                cookie: actorCookie,
                body: { reason: 'Recipe moderation responsibility is restored.' }
            });
            assert.equal(restoreRecipeModerator.status, 200);
            assert.deepEqual(await responseRoleCodes(restoreRecipeModerator), ['RecipeModerator']);
            const restoredSession = await issueStaffSession(invitation.staffUserId);

            const auditCountBeforeStaleRequest = await countAuditRows();
            const staleDisable = await lifecycleRequest(`/api/v1/admin/staff/${invitation.staffUserId}/disable`, {
                method: 'POST',
                cookie: staleActorCookie,
                body: { reason: 'Sensitive global revocation requires recent authentication.' }
            });
            assert.equal(staleDisable.status, 401);
            assert.equal(await responseErrorCode(staleDisable), 'AUTH_RECENT_AUTHENTICATION_REQUIRED');
            assert.equal((await staff.findById(invitation.staffUserId))?.status, 'active');
            assert.equal(await countAuditRows(), auditCountBeforeStaleRequest);

            const disable = await lifecycleRequest(`/api/v1/admin/staff/${invitation.staffUserId}/disable`, {
                method: 'POST',
                cookie: actorCookie,
                body: { reason: 'Confirmed staff departure requires global access revocation.' }
            });
            assert.equal(disable.status, 200);
            const disabled = (await disable.json()) as { status: string; activeSessionCount: number };
            assert.equal(disabled.status, 'disabled');
            assert.equal(disabled.activeSessionCount, 0);
            assert.equal(await sessions.isStaffSessionActive(restoredSession.id, invitation.staffUserId), false);
            const disabledCookieAccess = await fetch(`${matrixServer.baseUrl}/api/v1/admin/recipes/pending`, {
                headers: { cookie: restoredSession.cookie }
            });
            assert.equal(disabledCookieAccess.status, 401);
            assert.equal(await responseErrorCode(disabledCookieAccess), 'AUTH_BAD_TOKEN');

            const auditCountAfterDisable = await countAuditRows();
            const duplicateDisable = await lifecycleRequest(`/api/v1/admin/staff/${invitation.staffUserId}/disable`, {
                method: 'POST',
                cookie: actorCookie,
                body: { reason: 'A second disablement must not mutate the account.' }
            });
            assert.equal(duplicateDisable.status, 409);
            assert.equal(await responseErrorCode(duplicateDisable), 'STAFF_ALREADY_DISABLED');
            assert.equal(await countAuditRows(), auditCountAfterDisable);

            const enable = await lifecycleRequest(`/api/v1/admin/staff/${invitation.staffUserId}/enable`, {
                method: 'POST',
                cookie: actorCookie,
                body: { reason: 'Staff return has been reviewed and approved.' }
            });
            assert.equal(enable.status, 200);
            assert.equal(((await enable.json()) as { status: string }).status, 'active');
            assert.deepEqual(await sessions.findActiveStaffSessionsByUserId(invitation.staffUserId), []);

            const auditCountAfterEnable = await countAuditRows();
            const duplicateEnable = await lifecycleRequest(`/api/v1/admin/staff/${invitation.staffUserId}/enable`, {
                method: 'POST',
                cookie: actorCookie,
                body: { reason: 'An already active account cannot be enabled again.' }
            });
            assert.equal(duplicateEnable.status, 409);
            assert.equal(await responseErrorCode(duplicateEnable), 'STAFF_ENABLE_INVALID_STATUS');
            assert.equal(await countAuditRows(), auditCountAfterEnable);

            const postEnableSessionOne = await issueStaffSession(invitation.staffUserId);
            const postEnableSessionTwo = await issueStaffSession(invitation.staffUserId);
            const managedSessions = await lifecycleRequest(`/api/v1/admin/staff/${invitation.staffUserId}/sessions`, {
                cookie: actorCookie
            });
            assert.equal(managedSessions.status, 200);
            assert.equal(((await managedSessions.json()) as { sessions: unknown[] }).sessions.length, 2);

            const auditCountBeforeInvalidRevocation = await countAuditRows();
            const invalidRevocation = await lifecycleRequest(
                `/api/v1/admin/staff/${invitation.staffUserId}/sessions/${postEnableSessionOne.id}`,
                {
                    method: 'DELETE',
                    cookie: actorCookie,
                    body: { reason: 'Too short' }
                }
            );
            assert.equal(invalidRevocation.status, 400);
            assert.equal(await responseErrorCode(invalidRevocation), 'STAFF_SESSION_REVOKE_REASON_TOO_SHORT');
            assert.equal(await sessions.isStaffSessionActive(postEnableSessionOne.id, invitation.staffUserId), true);
            assert.equal(await countAuditRows(), auditCountBeforeInvalidRevocation);

            const managedRevocation = await lifecycleRequest(
                `/api/v1/admin/staff/${invitation.staffUserId}/sessions/${postEnableSessionOne.id}`,
                {
                    method: 'DELETE',
                    cookie: actorCookie,
                    body: { reason: 'The browser session is suspected to be compromised.' }
                }
            );
            assert.equal(managedRevocation.status, 204);
            assert.equal(await sessions.isStaffSessionActive(postEnableSessionOne.id, invitation.staffUserId), false);
            assert.equal(await sessions.isStaffSessionActive(postEnableSessionTwo.id, invitation.staffUserId), true);

            const revokedManagedCookie = await fetch(`${matrixServer.baseUrl}/api/v1/admin/recipes/pending`, {
                headers: { cookie: postEnableSessionOne.cookie }
            });
            assert.equal(revokedManagedCookie.status, 401);
            const survivingCookie = await fetch(`${matrixServer.baseUrl}/api/v1/admin/recipes/pending`, {
                headers: { cookie: postEnableSessionTwo.cookie }
            });
            assert.equal(survivingCookie.status, 204);

            const ownRevocation = await lifecycleRequest(`/api/v1/admin/auth/sessions/${postEnableSessionTwo.id}`, {
                method: 'DELETE',
                cookie: postEnableSessionTwo.cookie
            });
            assert.equal(ownRevocation.status, 204);
            assert.match(ownRevocation.headers.get('set-cookie') ?? '', /Expires=Thu, 01 Jan 1970/i);
            assert.equal(await sessions.isStaffSessionActive(postEnableSessionTwo.id, invitation.staffUserId), false);

            const [auditRows] = await pool.execute<RowDataPacket[]>(`SELECT Action FROM AdminAuditLogs ORDER BY Id`);
            assert.deepEqual(
                auditRows.map((row) => row.Action),
                [
                    'staff.invitations.create',
                    'staff.read',
                    'staff.roles.grant',
                    'staff.roles.revoke',
                    'staff.roles.revoke',
                    'staff.roles.grant',
                    'staff.disable',
                    'staff.enable',
                    'staff.sessions.list',
                    'staff.sessions.revoke',
                    'staff.sessions.revoke'
                ]
            );
        });

        it('returns stable staff business errors without mutation or audit side effects', async () => {
            const target = await users.findByEmail('lifecycle-staff@test.invalid');
            assert.ok(target);
            const auditCountBefore = await countAuditRows();
            const scenarios = [
                {
                    path: `/api/v1/admin/staff/${STAFF_FIXTURE_IDS.SuperAdmin}/disable`,
                    method: 'POST' as const,
                    reason: 'Self disablement must remain forbidden.',
                    status: 403,
                    code: 'STAFF_DISABLE_SELF_FORBIDDEN'
                },
                {
                    path: `/api/v1/admin/staff/${STAFF_FIXTURE_IDS.SuperAdmin}/roles/RecipeModerator`,
                    method: 'POST' as const,
                    reason: 'Self role escalation must remain forbidden.',
                    status: 403,
                    code: 'STAFF_ROLE_GRANT_SELF_FORBIDDEN'
                },
                {
                    path: `/api/v1/admin/staff/${STAFF_FIXTURE_IDS.SuperAdmin}/roles/SuperAdmin`,
                    method: 'DELETE' as const,
                    reason: 'Self role revocation must remain forbidden.',
                    status: 403,
                    code: 'STAFF_ROLE_REVOKE_SELF_FORBIDDEN'
                },
                {
                    path: `/api/v1/admin/staff/${target.id}/roles/RecipeModerator`,
                    method: 'POST' as const,
                    reason: 'Duplicate role grants must not mutate assignments.',
                    status: 409,
                    code: 'STAFF_ROLE_ALREADY_GRANTED'
                },
                {
                    path: `/api/v1/admin/staff/${target.id}/roles/UserAdmin`,
                    method: 'DELETE' as const,
                    reason: 'Missing role revocations must not mutate assignments.',
                    status: 409,
                    code: 'STAFF_ROLE_NOT_GRANTED'
                },
                {
                    path: `/api/v1/admin/staff/${target.id}/roles/UnknownRole`,
                    method: 'POST' as const,
                    reason: 'Unknown roles must be rejected by the backend.',
                    status: 404,
                    code: 'STAFF_ROLE_NOT_FOUND'
                }
            ];

            for (const scenario of scenarios) {
                const response = await lifecycleRequest(scenario.path, {
                    method: scenario.method,
                    cookie: actorCookie,
                    body: { reason: scenario.reason }
                });
                assert.equal(response.status, scenario.status, scenario.code);
                assert.equal(await responseErrorCode(response), scenario.code);
            }

            const invalidReason = await lifecycleRequest(`/api/v1/admin/staff/${target.id}/roles/UserAdmin`, {
                method: 'POST',
                cookie: actorCookie,
                body: { reason: 'short' }
            });
            assert.equal(invalidReason.status, 400);
            assert.equal(await responseErrorCode(invalidReason), 'STAFF_ROLE_GRANT_REASON_TOO_SHORT');
            assert.deepEqual(
                (await staff.findById(target.id))?.roles.map((role) => role.code),
                ['RecipeModerator']
            );
            assert.equal(await countAuditRows(), auditCountBefore);
        });

        async function createActiveStaffFixture(staffUserId: number, roleCode: SeededRoleCode | null): Promise<void> {
            await pool.execute(
                `INSERT INTO Users (Id, Mail, Username, Password, AccountType, Status, EmailValidatedAt)
       VALUES (?, ?, ?, 'test-password-hash', 'staff', 'inactive', CURRENT_TIMESTAMP)`,
                [staffUserId, `staff-${staffUserId}@test.invalid`, `staff-${staffUserId}`]
            );
            await pool.execute(
                `INSERT INTO StaffWebAuthnCredentials
         (CredentialId, StaffUserId, PublicKey, SignatureCounter, Transports,
          DeviceType, BackedUp, Aaguid)
       VALUES (?, ?, 0x0102, 0, JSON_ARRAY('internal'), 'singleDevice', FALSE,
               '00000000-0000-0000-0000-000000000000')`,
                [`credential-${staffUserId}`, staffUserId]
            );
            await pool.execute(`UPDATE StaffProfiles SET MfaEnrolledAt = CURRENT_TIMESTAMP WHERE UserId = ?`, [staffUserId]);
            if (roleCode) {
                await pool.execute(
                    `INSERT INTO StaffRoles (StaffUserId, RoleId)
         SELECT ?, Id FROM Roles WHERE Code = ?`,
                    [staffUserId, roleCode]
                );
            }
            await pool.execute(`UPDATE Users SET Status = 'active' WHERE Id = ?`, [staffUserId]);
        }

        async function issueStaffSession(staffUserId: number, mfaVerifiedAt = new Date()): Promise<IssuedStaffSession> {
            const user = await requireUser(staffUserId);
            const id = nextUuid(staffUserId);
            assert.equal(
                await sessions.createStaffSession({
                    id,
                    userId: staffUserId,
                    sessionVersion: await findStaffSessionVersion(staffUserId),
                    webAuthnCredentialId: `credential-${staffUserId}`,
                    mfaVerifiedAt,
                    ipAddress: `192.0.2.${staffUserId % 255}`,
                    userAgent: 'Recipe Shelter MySQL integration client',
                    expiresAt: new Date(Date.now() + 28_800_000)
                }),
                true
            );
            return { id, cookie: createCookie(user, 'admin', id) };
        }

        async function requireUser(userId: number): Promise<User> {
            const user = await users.findById(userId);
            assert.ok(user);
            return user;
        }

        async function findStaffSessionVersion(staffUserId: number): Promise<number> {
            const [rows] = await pool.execute<RowDataPacket[]>(`SELECT SessionVersion FROM StaffProfiles WHERE UserId = ?`, [staffUserId]);
            const sessionVersion = Number(rows[0]?.SessionVersion);
            assert.ok(Number.isSafeInteger(sessionVersion) && sessionVersion > 0);
            return sessionVersion;
        }

        function nextUuid(userId: number): string {
            sessionSequence += 1;
            return `00000000-0000-4000-8000-${String(userId).padStart(6, '0')}${String(sessionSequence).padStart(6, '0')}`;
        }

        function createAccessMatrixApp() {
            const app = express();
            const adminRouter = express.Router();
            const endpointHandler: RequestHandler = (_req, res) => {
                res.status(204).end();
            };

            app.use(cookieParser());
            app.use(express.json());
            adminRouter.use(requireStaffAuth, EnforceAuthorizationPolicies(adminAuthorizationPolicies));
            adminRouter.use(
                '/catalog-proposals',
                createAdminCatalogProposalsRouter({
                    list: endpointHandler,
                    acceptTag: endpointHandler,
                    acceptIngredient: endpointHandler,
                    reject: endpointHandler,
                    associateTag: endpointHandler,
                    associateIngredient: endpointHandler,
                    convertIngredientToAlias: endpointHandler
                })
            );
            adminRouter.use(endpointHandler);
            app.use('/api/v1/admin', adminRouter);
            app.use(
                '/api/v1/health',
                createHealthRouter({
                    live: endpointHandler,
                    ready: endpointHandler,
                    health: endpointHandler
                })
            );
            app.use(errorHandler);
            return app;
        }

        function createStaffLifecycleApp() {
            const auditActions = new AdminAuditActionRunnerMysql(pool, (db) => new AdminAuditService(new AdminAuditRepositoryMysql(db)));
            const staffController = createAdminStaffController(new AdminStaffService(staff, auditActions));
            const staffSessionsController = createStaffSessionsController(new StaffSessionService(sessions, users, auditActions));
            const invitationController = createStaffInvitationsController(
                new StaffInvitationService(
                    new StaffInvitationRepositoryMysql(pool),
                    {
                        async sendStaffInvitationEmail(input) {
                            invitationMessages.push(input);
                        }
                    },
                    auditActions,
                    'https://frontend.test.invalid',
                    {
                        invitationTtlMinutes: 60,
                        generateToken: () => 'integration-invitation-token',
                        hashToken: () => INVITATION_TOKEN_HASH
                    }
                )
            );
            const noOp: RequestHandler = (_req, res) => {
                res.status(204).end();
            };
            const authController = {
                register: noOp,
                login: noOp,
                staffLoginOptions: noOp,
                staffLoginVerify: noOp,
                staffMfaEnrollmentOptions: noOp,
                activateStaffInvitation: noOp,
                me: noOp,
                logout: noOp,
                staffLogout: noOp,
                forgotPassword: noOp,
                resetPassword: noOp,
                validateEmail: noOp,
                resendValidationEmail: noOp
            };
            const app = express();
            const adminRouter = express.Router();

            app.use(cookieParser());
            app.use(express.json());
            adminRouter.use('/auth', createStaffAuthRouter(authController, staffSessionsController));
            adminRouter.use(requireStaffAuth, EnforceAuthorizationPolicies(adminAuthorizationPolicies));
            adminRouter.use('/staff/invitations', createStaffInvitationsRouter(invitationController));
            adminRouter.use('/staff', createAdminStaffRouter(staffController));
            adminRouter.use('/staff', createAdminStaffSessionsRouter(staffSessionsController));
            app.use('/api/v1/admin', adminRouter);
            app.use(errorHandler);
            return app;
        }

        async function lifecycleRequest(
            path: string,
            options: {
                method?: 'DELETE' | 'GET' | 'POST';
                cookie: string;
                body?: unknown;
            }
        ): Promise<Response> {
            return fetch(`${lifecycleServer.baseUrl}${path}`, {
                method: options.method ?? 'GET',
                headers: {
                    cookie: options.cookie,
                    ...(options.body === undefined ? {} : { 'content-type': 'application/json' })
                },
                ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
            });
        }

        async function countAuditRows(): Promise<number> {
            const [rows] = await pool.execute<RowDataPacket[]>(`SELECT COUNT(*) AS AuditCount FROM AdminAuditLogs`);
            return Number(rows[0]?.AuditCount);
        }
    }
);

function requireBackendIntegrationDatabaseName(): string {
    if (!/^[a-zA-Z0-9_]+$/.test(baseTestDatabaseName)) throw new Error('TEST_DB_NAME must contain only letters, numbers and underscores');
    if (!baseTestDatabaseName.toLowerCase().includes('test')) throw new Error('TEST_DB_NAME must contain "test"');
    if (baseTestDatabaseName === env.db.name) throw new Error('TEST_DB_NAME must be different from DB_NAME');

    const databaseName = `${baseTestDatabaseName}_backend_access`;
    if (databaseName.length > 64) throw new Error('TEST_DB_NAME is too long for the backend access integration database suffix');
    return databaseName;
}

function targetDatabase(sql: string, databaseName: string): string {
    return sql.replace(/USE\s+recipe_shelter\s*;/i, `USE \`${databaseName}\`;`);
}

function materializePolicyPath(path: string): string {
    return path
        .replace(':staffUserId', '999')
        .replace(':sessionId', '00000000-0000-4000-8000-000000000999')
        .replace(':aliasId', '2')
        .replace(':roleCode', 'UserAdmin')
        .replace(':id', '1');
}

function createCookie(user: User, realm: 'admin' | 'app', sessionId: string): string {
    const token = signSessionToken(user, realm, sessionId);
    const cookieName = realm === 'admin' ? adminSessionCookieName : appSessionCookieName;
    return `${cookieName}=${token}`;
}

async function callEndpoint(server: HttpTestServer, endpoint: AccessEndpoint, cookie: string): Promise<Response> {
    return fetch(`${server.baseUrl}${endpoint.path}`, {
        method: endpoint.method,
        headers: { cookie }
    });
}

async function responseErrorCode(response: Response): Promise<string> {
    return ((await response.json()) as { error: { code: string } }).error.code;
}

async function responseRoleCodes(response: Response): Promise<string[]> {
    return ((await response.json()) as { roles: Array<{ code: string }> }).roles.map((role) => role.code);
}
