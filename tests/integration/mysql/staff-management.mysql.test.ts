import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import mysql from 'mysql2/promise';

import { AdminAuditRepositoryMysql } from '../../../src/repositories/admin/admin-audit.repository.mysql.js';
import { AdminStaffRepositoryMysql } from '../../../src/repositories/admin/admin.staff.repository.mysql.js';
import { SessionRepositoryMysql } from '../../../src/repositories/auth/session.repository.mysql.js';
import { AdminAuditActionRunnerMysql } from '../../../src/services/admin/admin-audit-action.runner.js';
import { AdminAuditService } from '../../../src/services/admin/admin-audit.service.js';
import { AdminStaffService } from '../../../src/services/admin/admin.staff.service.js';
import { env } from '../../../src/utils/env.js';
import { testAdminAuditContext } from '../../helpers/admin-audit.js';

const baseTestDatabaseName = process.env.TEST_DB_NAME?.trim() ?? '';
const mysqlEnabled = Boolean(baseTestDatabaseName);

function requireStaffManagementTestDatabaseName(): string {
  if (!/^[a-zA-Z0-9_]+$/.test(baseTestDatabaseName))
    throw new Error('TEST_DB_NAME must contain only letters, numbers and underscores');
  if (!baseTestDatabaseName.toLowerCase().includes('test'))
    throw new Error('TEST_DB_NAME must contain "test"');
  if (baseTestDatabaseName === env.db.name)
    throw new Error('TEST_DB_NAME must be different from DB_NAME');

  const databaseName = `${baseTestDatabaseName}_staff_management`;
  if (databaseName.length > 64)
    throw new Error('TEST_DB_NAME is too long for the staff management integration database suffix');
  return databaseName;
}

function targetDatabase(sql: string, databaseName: string): string {
  return sql.replace(/USE\s+recipe_shelter\s*;/i, `USE \`${databaseName}\`;`);
}

describe('staff management MySQL integration', { skip: !mysqlEnabled && 'Set TEST_DB_NAME to run isolated MySQL tests' }, () => {
  let adminConnection: mysql.Connection;
  let pool: mysql.Pool;
  let actorUserId: number;
  let targetUserId: number;
  let service: AdminStaffService;

  before(async () => {
    const databaseName = requireStaffManagementTestDatabaseName();
    adminConnection = await mysql.createConnection({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      multipleStatements: true
    });
    await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await adminConnection.query(
      `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );

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

    const [actorResult] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO Users (Mail, Username, Password, AccountType, Status, EmailValidatedAt)
       VALUES ('staff-manager@test.local', 'Staff Manager', 'password-hash', 'staff', 'inactive', CURRENT_TIMESTAMP)`
    );
    const [targetResult] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO Users (Mail, Username, Password, AccountType, Status, EmailValidatedAt)
       VALUES ('managed-staff@test.local', 'Managed Staff', 'password-hash', 'staff', 'inactive', CURRENT_TIMESTAMP)`
    );
    actorUserId = Number(actorResult.insertId);
    targetUserId = Number(targetResult.insertId);

    await pool.execute(
      `INSERT INTO StaffRoles (StaffUserId, RoleId)
       SELECT ?, Id FROM Roles WHERE Code = 'SuperAdmin'`,
      [actorUserId]
    );
    await pool.execute(
      `INSERT INTO StaffRoles (StaffUserId, RoleId)
       SELECT ?, Id FROM Roles WHERE Code = 'UserAdmin'`,
      [targetUserId]
    );
    await pool.execute(
      `INSERT INTO StaffWebAuthnCredentials
         (CredentialId, StaffUserId, PublicKey, SignatureCounter, DeviceType, BackedUp, Aaguid)
       VALUES
         ('staff-manager-credential', ?, 0x0102, 0, 'singleDevice', FALSE,
          '00000000-0000-0000-0000-000000000000'),
         ('managed-staff-credential', ?, 0x0304, 0, 'singleDevice', FALSE,
          '00000000-0000-0000-0000-000000000000')`,
      [actorUserId, targetUserId]
    );
    await pool.execute(
      `UPDATE StaffProfiles
       SET MfaEnrolledAt = CURRENT_TIMESTAMP
       WHERE UserId IN (?, ?)`,
      [actorUserId, targetUserId]
    );
    await pool.execute(
      `UPDATE Users SET Status = 'active' WHERE Id IN (?, ?)`,
      [actorUserId, targetUserId]
    );
    await pool.execute(
      `INSERT INTO StaffSessions
         (Id, StaffUserId, WebAuthnCredentialId, MfaVerifiedAt, IpAddress, UserAgent, ExpiresAt)
       VALUES
         ('00000000-0000-4000-8000-000000000531', ?, 'managed-staff-credential', CURRENT_TIMESTAMP,
          '192.0.2.31', 'Managed staff browser one', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 8 HOUR)),
         ('00000000-0000-4000-8000-000000000532', ?, 'managed-staff-credential', CURRENT_TIMESTAMP,
          '192.0.2.32', 'Managed staff browser two', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 8 HOUR))`,
      [targetUserId, targetUserId]
    );

    const auditActions = new AdminAuditActionRunnerMysql(
      pool,
      (db) => new AdminAuditService(
        new AdminAuditRepositoryMysql(db),
        () => '00000000-0000-4000-8000-000000000533'
      )
    );
    service = new AdminStaffService(new AdminStaffRepositoryMysql(pool), auditActions);
  });

  after(async () => {
    if (pool)
      await pool.end();
    if (adminConnection) {
      await adminConnection.query(`DROP DATABASE IF EXISTS \`${requireStaffManagementTestDatabaseName()}\``);
      await adminConnection.end();
    }
  });

  it('applies schema then seed and manages lifecycle, roles, sessions and audits atomically', async () => {
    const accounts = await service.list(actorUserId, testAdminAuditContext);
    assert.deepEqual(accounts.map((account) => account.id).sort((left, right) => left - right), [actorUserId, targetUserId]);

    const details = await service.get(targetUserId, actorUserId, testAdminAuditContext);
    assert.equal(details.activeSessionCount, 2);
    assert.deepEqual(details.roles.map((role) => role.code), ['UserAdmin']);

    const disabled = await service.disable(
      targetUserId,
      actorUserId,
      'Confirmed departure from the staff team.',
      testAdminAuditContext
    );
    assert.equal(disabled.status, 'disabled');
    assert.equal(disabled.disabledByStaffUserId, actorUserId);
    assert.equal(disabled.disabledReason, 'Confirmed departure from the staff team.');
    assert.equal(disabled.activeSessionCount, 0);
    assert.equal(await new SessionRepositoryMysql(pool).createStaffSession({
      id: '00000000-0000-4000-8000-000000000534',
      userId: targetUserId,
      webAuthnCredentialId: 'managed-staff-credential',
      mfaVerifiedAt: new Date(),
      ipAddress: '192.0.2.34',
      userAgent: 'Disabled staff login race',
      expiresAt: new Date(Date.now() + 60_000)
    }), false);

    const [revokedSessions] = await pool.query(
      `SELECT RevokedByStaffUserId, RevocationType, COUNT(*) AS SessionCount
       FROM StaffSessions
       WHERE StaffUserId = ? AND RevokedAt IS NOT NULL
       GROUP BY RevokedByStaffUserId, RevocationType`,
      [targetUserId]
    );
    assert.deepEqual(revokedSessions, [{
      RevokedByStaffUserId: actorUserId,
      RevocationType: 'admin',
      SessionCount: 2
    }]);

    const enabled = await service.enable(
      targetUserId,
      actorUserId,
      'Return to the staff team approved.',
      testAdminAuditContext
    );
    assert.equal(enabled.status, 'active');
    assert.equal(enabled.disabledByStaffUserId, null);

    const granted = await service.grantRole(
      targetUserId,
      'RecipeModerator',
      actorUserId,
      'Temporary recipe moderation coverage.',
      testAdminAuditContext
    );
    assert.deepEqual(granted.roles.map((role) => role.code), ['RecipeModerator', 'UserAdmin']);

    const revoked = await service.revokeRole(
      targetUserId,
      'RecipeModerator',
      actorUserId,
      'Temporary moderation coverage ended.',
      testAdminAuditContext
    );
    assert.deepEqual(revoked.roles.map((role) => role.code), ['UserAdmin']);

    const [auditRows] = await pool.query(
      `SELECT Action, TargetType, Reason
       FROM AdminAuditLogs
       ORDER BY Id`
    );
    assert.deepEqual(auditRows, [
      { Action: 'staff.list', TargetType: 'staff_collection', Reason: null },
      { Action: 'staff.read', TargetType: 'staff_user', Reason: null },
      { Action: 'staff.disable', TargetType: 'staff_user', Reason: 'Confirmed departure from the staff team.' },
      { Action: 'staff.enable', TargetType: 'staff_user', Reason: 'Return to the staff team approved.' },
      { Action: 'staff.roles.grant', TargetType: 'staff_user', Reason: 'Temporary recipe moderation coverage.' },
      { Action: 'staff.roles.revoke', TargetType: 'staff_user', Reason: 'Temporary moderation coverage ended.' }
    ]);
  });

  it('rejects physical staff deletion and preserves every audit actor foreign key', async () => {
    const databaseName = requireStaffManagementTestDatabaseName();
    const protectedForeignKeys = [
      'staff_profiles_user_account_type_FK',
      'staff_profiles_disabled_by_staff_profile_FK',
      'staff_roles_staff_profile_FK',
      'staff_invitations_staff_profile_FK',
      'staff_invitations_created_by_staff_profile_FK',
      'staff_webauthn_credentials_staff_profile_FK',
      'staff_webauthn_challenges_staff_profile_FK',
      'staff_sessions_user_FK',
      'staff_sessions_webauthn_credential_FK',
      'staff_sessions_revoked_by_user_FK',
      'admin_audit_logs_actor_FK'
    ];
    const placeholders = protectedForeignKeys.map(() => '?').join(', ');
    const [foreignKeys] = await pool.query(
      `SELECT CONSTRAINT_NAME AS ConstraintName, DELETE_RULE AS DeleteRule
       FROM information_schema.REFERENTIAL_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = ?
         AND CONSTRAINT_NAME IN (${placeholders})
       ORDER BY CONSTRAINT_NAME`,
      [databaseName, ...protectedForeignKeys]
    );
    assert.deepEqual(foreignKeys, [...protectedForeignKeys].sort().map((ConstraintName) => ({
      ConstraintName,
      DeleteRule: 'RESTRICT'
    })));

    await assert.rejects(
      () => pool.execute(`DELETE FROM StaffProfiles WHERE UserId = ?`, [targetUserId]),
      /Staff profiles cannot be physically deleted/
    );
    await assert.rejects(
      () => pool.execute(`DELETE FROM Users WHERE Id = ?`, [actorUserId])
    );

    const [preservedActors] = await pool.query(
      `SELECT audit.ActorUserId, staff.UserId AS StaffUserId, users.Username, COUNT(*) AS AuditCount
       FROM AdminAuditLogs AS audit
       INNER JOIN StaffProfiles AS staff ON staff.UserId = audit.ActorUserId
       INNER JOIN Users AS users ON users.Id = staff.UserId
       GROUP BY audit.ActorUserId, staff.UserId, users.Username`
    );
    assert.deepEqual(preservedActors, [{
      ActorUserId: actorUserId,
      StaffUserId: actorUserId,
      Username: 'Staff Manager',
      AuditCount: 6
    }]);

    const [staffRows] = await pool.query(
      `SELECT UserId FROM StaffProfiles WHERE UserId IN (?, ?) ORDER BY UserId`,
      [actorUserId, targetUserId]
    );
    assert.deepEqual(staffRows, [
      { UserId: actorUserId },
      { UserId: targetUserId }
    ]);
  });
});
