import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { AdminStaffService } from '../../../src/services/admin/admin.staff.service.js';
import { HttpError } from '../../../src/utils/errors.js';
import { TestAdminAuditRecorder, testAdminAuditContext } from '../../helpers/admin-audit.js';

import type { AdminStaffRepository } from '../../../src/repositories/admin/admin.staff.repository.interface.js';
import type { AdminStaffAccount, AdminStaffRole } from '../../../src/repositories/admin/admin.staff.types.js';

const actor = createStaffAccount(1, 'actor-staff', ['SuperAdmin']);
const target = createStaffAccount(2, 'target-staff', ['UserAdmin']);

class TestAdminStaffRepository implements AdminStaffRepository {
  readonly accounts = new Map<number, AdminStaffAccount>();
  readonly roles = new Map<string, AdminStaffRole>([
    ['SuperAdmin', { id: 5, code: 'SuperAdmin', name: 'Super administrateur' }],
    ['UserAdmin', { id: 3, code: 'UserAdmin', name: 'Administrateur des utilisateurs' }],
    ['RecipeModerator', { id: 1, code: 'RecipeModerator', name: 'Modérateur de recettes' }]
  ]);

  constructor() {
    this.accounts.set(actor.id, cloneStaff(actor));
    this.accounts.set(target.id, cloneStaff(target));
  }

  async findAll(): Promise<AdminStaffAccount[]> {
    return [...this.accounts.values()].map(cloneStaff);
  }

  async findById(staffUserId: number): Promise<AdminStaffAccount | null> {
    const account = this.accounts.get(staffUserId);
    return account ? cloneStaff(account) : null;
  }

  async findRoleByCode(roleCode: string): Promise<AdminStaffRole | null> {
    return this.roles.get(roleCode) ?? null;
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
    account.disabledAt = new Date('2026-07-17T12:00:00.000Z');
    account.activeSessionCount = 0;
    return revokedSessionCount;
  }

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
    if (!account)
      return false;

    const index = account.roles.findIndex((candidate) => candidate.id === roleId);
    if (index < 0)
      return false;

    account.roles.splice(index, 1);
    return true;
  }
}

describe('AdminStaffService', () => {
  let repository: TestAdminStaffRepository;
  let audit: TestAdminAuditRecorder;
  let service: AdminStaffService;

  beforeEach(() => {
    repository = new TestAdminStaffRepository();
    audit = new TestAdminAuditRecorder();
    service = new AdminStaffService(repository, audit);
  });

  it('lists and consults staff with one audit per read action', async () => {
    const accounts = await service.list(actor.id, testAdminAuditContext);
    const account = await service.get(target.id, actor.id, testAdminAuditContext);

    assert.equal(accounts.length, 2);
    assert.equal(account.id, target.id);
    assert.deepEqual(audit.inputs.map((input) => ({
      eventType: input.eventType,
      targetType: input.targetType,
      targetId: input.targetId
    })), [
      { eventType: 'staff.list', targetType: 'staff_collection', targetId: 'all' },
      { eventType: 'staff.read', targetType: 'staff_user', targetId: target.id }
    ]);
  });

  it('disables an active account, revokes every active session, then enables it with mandatory audits', async () => {
    repository.accounts.get(target.id)!.activeSessionCount = 2;

    const disabled = await service.disable(
      target.id,
      actor.id,
      'Confirmed departure from the staff team.',
      testAdminAuditContext
    );
    assert.equal(disabled.status, 'disabled');
    assert.equal(disabled.activeSessionCount, 0);
    assert.equal(disabled.disabledByStaffUserId, actor.id);

    const enabled = await service.enable(
      target.id,
      actor.id,
      'Return to the staff team approved.',
      testAdminAuditContext
    );
    assert.equal(enabled.status, 'active');
    assert.equal(enabled.disabledReason, null);

    assert.deepEqual(audit.inputs.map((input) => ({
      eventType: input.eventType,
      reason: input.reason,
      beforeStatus: input.beforeValues?.status,
      afterStatus: input.afterValues?.status,
      revokedSessionCount: input.afterValues?.revokedSessionCount
    })), [
      {
        eventType: 'staff.disable',
        reason: 'Confirmed departure from the staff team.',
        beforeStatus: 'active',
        afterStatus: 'disabled',
        revokedSessionCount: 2
      },
      {
        eventType: 'staff.enable',
        reason: 'Return to the staff team approved.',
        beforeStatus: 'disabled',
        afterStatus: 'active',
        revokedSessionCount: undefined
      }
    ]);
  });

  it('grants and revokes roles with the exact changed role and reason in the audit', async () => {
    const granted = await service.grantRole(
      target.id,
      'RecipeModerator',
      actor.id,
      'Temporary recipe moderation coverage.',
      testAdminAuditContext
    );
    assert.deepEqual(granted.roles.map((role) => role.code), ['RecipeModerator', 'UserAdmin']);

    const revoked = await service.revokeRole(
      target.id,
      'RecipeModerator',
      actor.id,
      'Temporary moderation coverage ended.',
      testAdminAuditContext
    );
    assert.deepEqual(revoked.roles.map((role) => role.code), ['UserAdmin']);
    assert.deepEqual(audit.inputs.map((input) => ({
      eventType: input.eventType,
      reason: input.reason,
      changedRole: input.afterValues?.changedRole
    })), [
      {
        eventType: 'staff.roles.grant',
        reason: 'Temporary recipe moderation coverage.',
        changedRole: 'RecipeModerator'
      },
      {
        eventType: 'staff.roles.revoke',
        reason: 'Temporary moderation coverage ended.',
        changedRole: 'RecipeModerator'
      }
    ]);
  });

  it('rejects unsafe lifecycle and role transitions without producing an audit', async () => {
    await assert.rejects(
      () => service.disable(actor.id, actor.id, 'Self disable attempt is forbidden.', testAdminAuditContext),
      (error) => assertHttpError(error, 403, 'STAFF_DISABLE_SELF_FORBIDDEN')
    );
    await assert.rejects(
      () => service.revokeRole(actor.id, 'SuperAdmin', actor.id, 'Self role removal is forbidden.', testAdminAuditContext),
      (error) => assertHttpError(error, 403, 'STAFF_ROLE_REVOKE_SELF_FORBIDDEN')
    );
    await assert.rejects(
      () => service.disable(target.id, actor.id, 'short', testAdminAuditContext),
      (error) => assertHttpError(error, 400, 'STAFF_DISABLE_REASON_TOO_SHORT')
    );
    await assert.rejects(
      () => service.enable(target.id, actor.id, 'Account was never disabled.', testAdminAuditContext),
      (error) => assertHttpError(error, 409, 'STAFF_ENABLE_INVALID_STATUS')
    );
    await assert.rejects(
      () => service.grantRole(target.id, 'UserAdmin', actor.id, 'Duplicate role assignment rejected.', testAdminAuditContext),
      (error) => assertHttpError(error, 409, 'STAFF_ROLE_ALREADY_GRANTED')
    );
    await assert.rejects(
      () => service.grantRole(target.id, 'UnknownRole', actor.id, 'Unknown role assignment rejected.', testAdminAuditContext),
      (error) => assertHttpError(error, 404, 'STAFF_ROLE_NOT_FOUND')
    );
    await assert.rejects(
      () => service.get(999, actor.id, testAdminAuditContext),
      (error) => assertHttpError(error, 404, 'STAFF_USER_NOT_FOUND')
    );
    assert.equal(audit.inputs.length, 0);
  });
});

function createStaffAccount(id: number, displayName: string, roleCodes: string[]): AdminStaffAccount {
  const knownRoles: Record<string, AdminStaffRole> = {
    SuperAdmin: { id: 5, code: 'SuperAdmin', name: 'Super administrateur' },
    UserAdmin: { id: 3, code: 'UserAdmin', name: 'Administrateur des utilisateurs' }
  };

  return {
    id,
    email: `${displayName}@example.com`,
    displayName,
    status: 'active',
    mfaEnrolledAt: new Date('2026-07-16T10:00:00.000Z'),
    disabledByStaffUserId: null,
    disabledByDisplayName: null,
    disabledReason: null,
    disabledAt: null,
    activeSessionCount: 1,
    roles: roleCodes.map((code) => knownRoles[code]!),
    createdAt: new Date('2026-07-16T10:00:00.000Z'),
    updatedAt: new Date('2026-07-16T10:00:00.000Z')
  };
}

function cloneStaff(account: AdminStaffAccount): AdminStaffAccount {
  return {
    ...account,
    roles: account.roles.map((role) => ({ ...role }))
  };
}

function assertHttpError(error: unknown, status: number, code: string): boolean {
  assert.ok(error instanceof HttpError);
  assert.equal(error.statusCode, status);
  assert.equal(error.code, code);
  return true;
}
