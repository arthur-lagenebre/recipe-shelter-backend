import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';

import { adminAuthorizationPolicies } from '../../src/api/admin/admin.authorization.js';
import { createAdminStaffController } from '../../src/api/admin/admin.staff.controller.js';
import { createAdminStaffRouter } from '../../src/api/admin/admin.staff.routes.js';
import { EnforceAuthorizationPolicies } from '../../src/middlewares/authorization.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { configureAuthRbacRepository, configureAuthSessionRepository, configureAuthUserRepository, requireStaffAuth } from '../../src/middlewares/require-auth.js';
import { PERMISSIONS } from '../../src/security/permissions.js';
import { AdminStaffService } from '../../src/services/admin/admin.staff.service.js';
import { TestAdminAuditRecorder } from '../helpers/admin-audit.js';
import { TestSessionRepository } from '../helpers/auth-session.js';
import { startHttpTestServer } from '../helpers/http-test-server.js';

import type { AdminStaffRepository } from '../../src/repositories/admin/admin.staff.repository.interface.js';
import type { AdminStaffAccount, AdminStaffRole } from '../../src/repositories/admin/admin.staff.types.js';
import type { User } from '../../src/repositories/users/user.types.js';
import type { PermissionCode } from '../../src/security/permissions.js';
import type { HttpTestServer } from '../helpers/http-test-server.js';

const actorUser = createUser(1, 'staff-manager');
const targetUser = createUser(2, 'managed-staff');
const protectedSuperAdminUser = createUser(3, 'protected-super-admin');

class HttpAdminStaffRepository implements AdminStaffRepository {
  readonly accounts = new Map<number, AdminStaffAccount>([
    [actorUser.id, createAccount(actorUser, [{ id: 3, code: 'UserAdmin', name: 'Administrateur des utilisateurs' }])],
    [targetUser.id, createAccount(targetUser, [{ id: 3, code: 'UserAdmin', name: 'Administrateur des utilisateurs' }])],
    [protectedSuperAdminUser.id, createAccount(protectedSuperAdminUser, [{ id: 5, code: 'SuperAdmin', name: 'Super administrateur' }])]
  ]);
  readonly roles = new Map<string, AdminStaffRole>([
    ['SuperAdmin', { id: 5, code: 'SuperAdmin', name: 'Super administrateur' }],
    ['UserAdmin', { id: 3, code: 'UserAdmin', name: 'Administrateur des utilisateurs' }],
    ['RecipeModerator', { id: 1, code: 'RecipeModerator', name: 'Modérateur de recettes' }]
  ]);

  async findAll(): Promise<AdminStaffAccount[]> {
    return [...this.accounts.values()].map(cloneAccount);
  }

  async findById(staffUserId: number): Promise<AdminStaffAccount | null> {
    const account = this.accounts.get(staffUserId);
    return account ? cloneAccount(account) : null;
  }

  async findRoleByCode(roleCode: string): Promise<AdminStaffRole | null> {
    return this.roles.get(roleCode) ?? null;
  }

  async lockAndCheckLastActiveSuperAdmin(staffUserId: number): Promise<boolean> {
    const activeSuperAdmins = [...this.accounts.values()].filter((account) =>
      account.status === 'active'
      && account.roles.some((role) => role.code === 'SuperAdmin')
    );

    return activeSuperAdmins.length === 1 && activeSuperAdmins[0]?.id === staffUserId;
  }

  async disable(staffUserId: number, actorStaffUserId: number, reason: string): Promise<number | null> {
    const account = this.accounts.get(staffUserId);
    if (!account || account.status !== 'active')
      return null;

    const revokedSessionCount = account.activeSessionCount;
    account.status = 'disabled';
    account.disabledByStaffUserId = actorStaffUserId;
    account.disabledByDisplayName = this.accounts.get(actorStaffUserId)?.displayName ?? null;
    account.disabledReason = reason;
    account.disabledAt = new Date('2026-07-17T14:00:00.000Z');
    account.activeSessionCount = 0;
    return revokedSessionCount;
  }

  async createModerationLog(): Promise<void> { }

  async enable(staffUserId: number): Promise<boolean> {
    const account = this.accounts.get(staffUserId);
    if (!account || account.status !== 'disabled')
      return false;

    account.status = 'active';
    account.disabledByStaffUserId = null;
    account.disabledByDisplayName = null;
    account.disabledReason = null;
    account.disabledAt = null;
    return true;
  }

  async grantRole(staffUserId: number, roleId: number): Promise<boolean> {
    const account = this.accounts.get(staffUserId);
    const role = [...this.roles.values()].find((candidate) => candidate.id === roleId);
    if (!account || !role || account.roles.some((candidate) => candidate.id === roleId))
      return false;

    account.roles.push(role);
    account.roles.sort((left, right) => left.code.localeCompare(right.code));
    return true;
  }

  async revokeRole(staffUserId: number, roleId: number): Promise<boolean> {
    const account = this.accounts.get(staffUserId);
    const roleIndex = account?.roles.findIndex((role) => role.id === roleId) ?? -1;
    if (!account || roleIndex < 0)
      return false;

    account.roles.splice(roleIndex, 1);
    return true;
  }
}

describe('staff management HTTP integration', () => {
  let server: HttpTestServer;
  let actorCookie: string;
  let staleActorCookie: string;
  let protectedSuperAdminCookie: string;
  let grantedPermissions: PermissionCode[] = [];
  let audit: TestAdminAuditRecorder;

  before(async () => {
    const users = new Map<number, User>([
      [actorUser.id, actorUser],
      [targetUser.id, targetUser],
      [protectedSuperAdminUser.id, protectedSuperAdminUser]
    ]);
    configureAuthUserRepository({
      async findById(id) {
        return users.get(id) ?? null;
      }
    });
    configureAuthRbacRepository({
      async findPermissionCodesByStaffUserId() {
        return [...grantedPermissions];
      }
    });
    const sessions = new TestSessionRepository();
    configureAuthSessionRepository(sessions);
    actorCookie = await sessions.issueCookie(actorUser, 'admin');
    staleActorCookie = await sessions.issueCookie(actorUser, 'admin', {
      mfaVerifiedAt: new Date(Date.now() - 301_000)
    });
    protectedSuperAdminCookie = await sessions.issueCookie(protectedSuperAdminUser, 'admin');

    audit = new TestAdminAuditRecorder();
    const service = new AdminStaffService(new HttpAdminStaffRepository(), audit);
    const controller = createAdminStaffController(service);
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    const adminRouter = express.Router();
    adminRouter.use(requireStaffAuth, EnforceAuthorizationPolicies(adminAuthorizationPolicies));
    adminRouter.use('/staff', createAdminStaffRouter(controller));
    app.use('/api/v1/admin', adminRouter);
    app.use(errorHandler);
    server = await startHttpTestServer(app);
  });

  after(async () => server.close());

  it('lists and consults staff only with staff.read and audits both reads', async () => {
    audit.inputs.length = 0;
    grantedPermissions = [];
    const forbidden = await fetch(`${server.baseUrl}/api/v1/admin/staff`, {
      headers: { cookie: actorCookie }
    });
    assert.equal(forbidden.status, 403);

    grantedPermissions = [PERMISSIONS.staffRead];
    const list = await fetch(`${server.baseUrl}/api/v1/admin/staff`, {
      headers: { cookie: actorCookie }
    });
    assert.equal(list.status, 200);
    assert.equal((await list.json() as { staff: unknown[] }).staff.length, 3);

    const details = await fetch(`${server.baseUrl}/api/v1/admin/staff/${targetUser.id}`, {
      headers: { cookie: actorCookie }
    });
    assert.equal(details.status, 200);
    assert.equal((await details.json() as { id: number }).id, targetUser.id);
    assert.deepEqual(audit.inputs.map((input) => input.eventType), ['staff.list', 'staff.read']);
  });

  it('requires exact lifecycle permissions and meaningful audited reasons', async () => {
    audit.inputs.length = 0;
    grantedPermissions = [PERMISSIONS.staffDisable];
    const missingReason = await fetch(`${server.baseUrl}/api/v1/admin/staff/${targetUser.id}/disable`, {
      method: 'POST',
      headers: { cookie: actorCookie, 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(missingReason.status, 400);

    const disabled = await fetch(`${server.baseUrl}/api/v1/admin/staff/${targetUser.id}/disable`, {
      method: 'POST',
      headers: { cookie: actorCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Confirmed departure from the staff team.' })
    });
    assert.equal(disabled.status, 200);
    assert.equal((await disabled.json() as { status: string; activeSessionCount: number }).status, 'disabled');

    grantedPermissions = [PERMISSIONS.staffEnable];
    const enabled = await fetch(`${server.baseUrl}/api/v1/admin/staff/${targetUser.id}/enable`, {
      method: 'POST',
      headers: { cookie: actorCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Return to the staff team approved.' })
    });
    assert.equal(enabled.status, 200);
    assert.equal((await enabled.json() as { status: string }).status, 'active');
    assert.deepEqual(audit.inputs.map((input) => input.eventType), ['staff.disable', 'staff.enable']);
  });

  it('grants and revokes a role only with their distinct permissions and audits the motif', async () => {
    audit.inputs.length = 0;
    grantedPermissions = [PERMISSIONS.staffRoleGrant];
    const granted = await fetch(`${server.baseUrl}/api/v1/admin/staff/${targetUser.id}/roles/RecipeModerator`, {
      method: 'POST',
      headers: { cookie: actorCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Temporary recipe moderation coverage.' })
    });
    assert.equal(granted.status, 200);
    assert.deepEqual(
      (await granted.json() as { roles: AdminStaffRole[] }).roles.map((role) => role.code),
      ['RecipeModerator', 'UserAdmin']
    );

    grantedPermissions = [PERMISSIONS.staffRoleRevoke];
    const revoked = await fetch(`${server.baseUrl}/api/v1/admin/staff/${targetUser.id}/roles/RecipeModerator`, {
      method: 'DELETE',
      headers: { cookie: actorCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Temporary moderation coverage ended.' })
    });
    assert.equal(revoked.status, 200);
    assert.deepEqual(
      (await revoked.json() as { roles: AdminStaffRole[] }).roles.map((role) => role.code),
      ['UserAdmin']
    );
    assert.deepEqual(audit.inputs.map((input) => ({
      eventType: input.eventType,
      reason: input.reason
    })), [
      { eventType: 'staff.roles.grant', reason: 'Temporary recipe moderation coverage.' },
      { eventType: 'staff.roles.revoke', reason: 'Temporary moderation coverage ended.' }
    ]);
  });

  it('requires recent strong authentication for global revocation and SuperAdmin changes only', async () => {
    audit.inputs.length = 0;
    grantedPermissions = [PERMISSIONS.staffDisable];
    const disable = await fetch(`${server.baseUrl}/api/v1/admin/staff/${targetUser.id}/disable`, {
      method: 'POST',
      headers: { cookie: staleActorCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Global access revocation requires fresh authentication.' })
    });
    assert.equal(disable.status, 401);
    assert.equal(
      (await disable.json() as { error: { code: string } }).error.code,
      'AUTH_RECENT_AUTHENTICATION_REQUIRED'
    );

    grantedPermissions = [PERMISSIONS.staffRoleGrant];
    for (const roleCode of ['SuperAdmin', 'superadmin']) {
      const grantSuperAdmin = await fetch(`${server.baseUrl}/api/v1/admin/staff/${targetUser.id}/roles/${roleCode}`, {
        method: 'POST',
        headers: { cookie: staleActorCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'SuperAdmin elevation requires fresh authentication.' })
      });
      assert.equal(grantSuperAdmin.status, 401);
      assert.equal(
        (await grantSuperAdmin.json() as { error: { code: string } }).error.code,
        'AUTH_RECENT_AUTHENTICATION_REQUIRED'
      );
    }

    const grantOrdinaryRole = await fetch(`${server.baseUrl}/api/v1/admin/staff/${targetUser.id}/roles/RecipeModerator`, {
      method: 'POST',
      headers: { cookie: staleActorCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Ordinary role assignment remains permission protected.' })
    });
    assert.equal(grantOrdinaryRole.status, 200);

    grantedPermissions = [PERMISSIONS.staffRoleRevoke];
    const revokeOrdinaryRole = await fetch(`${server.baseUrl}/api/v1/admin/staff/${targetUser.id}/roles/RecipeModerator`, {
      method: 'DELETE',
      headers: { cookie: staleActorCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Ordinary role assignment cleanup remains permitted.' })
    });
    assert.equal(revokeOrdinaryRole.status, 200);
    assert.deepEqual(audit.inputs.map((input) => input.eventType), [
      'staff.roles.grant',
      'staff.roles.revoke'
    ]);
  });

  it('rejects every privileged self-action with a stable business error and no side effect', async () => {
    audit.inputs.length = 0;
    grantedPermissions = [PERMISSIONS.staffDisable];
    const disableSelf = await fetch(`${server.baseUrl}/api/v1/admin/staff/${actorUser.id}/disable`, {
      method: 'POST',
      headers: { cookie: actorCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Self disablement must be rejected explicitly.' })
    });
    assert.equal(disableSelf.status, 403);
    assert.equal(
      (await disableSelf.json() as { error: { code: string } }).error.code,
      'STAFF_DISABLE_SELF_FORBIDDEN'
    );

    grantedPermissions = [PERMISSIONS.staffRoleGrant];
    const grantSelf = await fetch(`${server.baseUrl}/api/v1/admin/staff/${actorUser.id}/roles/SuperAdmin`, {
      method: 'POST',
      headers: { cookie: actorCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Self privilege escalation must be rejected.' })
    });
    assert.equal(grantSelf.status, 403);
    assert.equal(
      (await grantSelf.json() as { error: { code: string } }).error.code,
      'STAFF_ROLE_GRANT_SELF_FORBIDDEN'
    );

    grantedPermissions = [PERMISSIONS.staffRoleRevoke];
    const revokeOwnRole = await fetch(`${server.baseUrl}/api/v1/admin/staff/${actorUser.id}/roles/UserAdmin`, {
      method: 'DELETE',
      headers: { cookie: actorCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Self role removal must be rejected explicitly.' })
    });
    assert.equal(revokeOwnRole.status, 403);
    assert.equal(
      (await revokeOwnRole.json() as { error: { code: string } }).error.code,
      'STAFF_ROLE_REVOKE_SELF_FORBIDDEN'
    );

    const revokeOwnLastSuperAdminRole = await fetch(`${server.baseUrl}/api/v1/admin/staff/${protectedSuperAdminUser.id}/roles/SuperAdmin`, {
      method: 'DELETE',
      headers: { cookie: protectedSuperAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Self SuperAdmin removal must be rejected explicitly.' })
    });
    assert.equal(revokeOwnLastSuperAdminRole.status, 403);
    assert.equal(
      (await revokeOwnLastSuperAdminRole.json() as { error: { code: string } }).error.code,
      'STAFF_ROLE_REVOKE_SELF_FORBIDDEN'
    );
    assert.equal(audit.inputs.length, 0);
  });

  it('returns LAST_ACTIVE_SUPER_ADMIN when another actor targets the final active administrator', async () => {
    audit.inputs.length = 0;
    grantedPermissions = [PERMISSIONS.staffDisable];
    const disable = await fetch(`${server.baseUrl}/api/v1/admin/staff/${protectedSuperAdminUser.id}/disable`, {
      method: 'POST',
      headers: { cookie: actorCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Attempt to disable the final active administrator.' })
    });
    assert.equal(disable.status, 409);
    assert.equal(
      (await disable.json() as { error: { code: string } }).error.code,
      'LAST_ACTIVE_SUPER_ADMIN'
    );

    grantedPermissions = [PERMISSIONS.staffRoleRevoke];
    const revoke = await fetch(`${server.baseUrl}/api/v1/admin/staff/${protectedSuperAdminUser.id}/roles/SuperAdmin`, {
      method: 'DELETE',
      headers: { cookie: actorCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Attempt to revoke the final administration role.' })
    });
    assert.equal(revoke.status, 409);
    assert.equal(
      (await revoke.json() as { error: { code: string } }).error.code,
      'LAST_ACTIVE_SUPER_ADMIN'
    );
    assert.equal(audit.inputs.length, 0);
  });
});

function createUser(id: number, username: string): User {
  return {
    id,
    mail: `${username}@example.com`,
    username,
    accountType: 'staff',
    status: 'active',
    emailValidatedAt: new Date('2026-07-16T10:00:00.000Z'),
    bannedByUserId: null,
    bannedReason: null,
    bannedAt: null,
    createdAt: new Date('2026-07-16T10:00:00.000Z'),
    updatedAt: new Date('2026-07-16T10:00:00.000Z')
  };
}

function createAccount(user: User, roles: AdminStaffRole[]): AdminStaffAccount {
  return {
    id: user.id,
    email: user.mail,
    displayName: user.username,
    status: 'active',
    mfaEnrolledAt: new Date('2026-07-16T10:00:00.000Z'),
    disabledByStaffUserId: null,
    disabledByDisplayName: null,
    disabledReason: null,
    disabledAt: null,
    activeSessionCount: 1,
    roles,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function cloneAccount(account: AdminStaffAccount): AdminStaffAccount {
  return { ...account, roles: account.roles.map((role) => ({ ...role })) };
}
