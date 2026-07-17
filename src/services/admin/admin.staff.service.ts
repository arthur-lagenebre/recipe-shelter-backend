import { ADMIN_AUDIT_EVENT_TYPES, ADMIN_AUDIT_TARGET_TYPES } from './admin-audit.events.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';

import type { AdminAuditActionRunner } from './admin-audit-action.runner.js';
import type { AdminAuditRecorder, AdminAuditRequestContext } from './admin-audit.service.js';
import type { AdminStaffRepository } from '../../repositories/admin/admin.staff.repository.interface.js';
import type { AdminStaffAccount, AdminStaffRole } from '../../repositories/admin/admin.staff.types.js';

const ACTION_REASON_MIN_LENGTH = 10;
const ACTION_REASON_MAX_LENGTH = 1000;
const SUPER_ADMIN_ROLE_CODE = 'SuperAdmin';

type StaffLifecycleAction = 'disable' | 'enable';
type StaffRoleAction = 'grant' | 'revoke';

export class AdminStaffService {
  constructor(private readonly staff: AdminStaffRepository, private readonly auditActions: AdminAuditActionRunner) { }

  async list(actorStaffUserId: number, context: AdminAuditRequestContext): Promise<AdminStaffAccount[]> {
    return this.auditActions.run(async ({ db, audit }) => {
      const accounts = await this.staff.findAll(db);

      await audit.record({
        actorUserId: actorStaffUserId,
        eventType: ADMIN_AUDIT_EVENT_TYPES.staffList,
        targetType: ADMIN_AUDIT_TARGET_TYPES.staffCollection,
        targetId: 'all',
        afterValues: { resultCount: accounts.length },
        ...context
      });

      return accounts;
    });
  }

  async get(staffUserId: number, actorStaffUserId: number, context: AdminAuditRequestContext): Promise<AdminStaffAccount> {
    return this.auditActions.run(async ({ db, audit }) => {
      const account = await this.requireStaff(staffUserId, db);

      await audit.record({
        actorUserId: actorStaffUserId,
        eventType: ADMIN_AUDIT_EVENT_TYPES.staffRead,
        targetType: ADMIN_AUDIT_TARGET_TYPES.staffUser,
        targetId: staffUserId,
        afterValues: snapshotStaff(account),
        ...context
      });

      return account;
    });
  }

  async disable(staffUserId: number, actorStaffUserId: number, reason: string, context: AdminAuditRequestContext): Promise<AdminStaffAccount> {
    const cleanReason = validateActionReason(reason, 'disable');

    return this.auditActions.run(async ({ db, audit }) => {
      const isLastActiveSuperAdmin = await this.staff.lockAndCheckLastActiveSuperAdmin(staffUserId, db);

      if (isLastActiveSuperAdmin)
        throw lastActiveSuperAdminConflict();
      if (staffUserId === actorStaffUserId)
        throw forbidden('Staff users cannot disable themselves', 'STAFF_DISABLE_SELF_FORBIDDEN');

      const before = await this.requireStaff(staffUserId, db);

      if (before.status === 'disabled')
        throw conflict('Staff account is already disabled', 'STAFF_ALREADY_DISABLED');
      if (before.status !== 'active')
        throw conflict('Only an active staff account can be disabled', 'STAFF_DISABLE_INVALID_STATUS');

      const revokedSessionCount = await this.staff.disable(staffUserId, actorStaffUserId, cleanReason, db);
      if (revokedSessionCount === null)
        throw conflict('Staff account status changed concurrently', 'STAFF_STATUS_CONFLICT');

      const after = await this.requireStaff(staffUserId, db);
      await this.recordLifecycleAudit(
        audit,
        ADMIN_AUDIT_EVENT_TYPES.staffDisable,
        before,
        after,
        actorStaffUserId,
        cleanReason,
        context,
        revokedSessionCount
      );

      return after;
    });
  }

  async enable(staffUserId: number, actorStaffUserId: number, reason: string, context: AdminAuditRequestContext): Promise<AdminStaffAccount> {
    const cleanReason = validateActionReason(reason, 'enable');

    return this.auditActions.run(async ({ db, audit }) => {
      const before = await this.requireStaff(staffUserId, db);

      if (before.status !== 'disabled')
        throw conflict('Only a disabled staff account can be enabled', 'STAFF_ENABLE_INVALID_STATUS');
      if (!before.mfaEnrolledAt)
        throw conflict('Staff account must have MFA enrolled before it can be enabled', 'STAFF_ENABLE_MFA_REQUIRED');

      if (!await this.staff.enable(staffUserId, db))
        throw conflict('Staff account status changed concurrently', 'STAFF_STATUS_CONFLICT');

      const after = await this.requireStaff(staffUserId, db);
      await this.recordLifecycleAudit(
        audit,
        ADMIN_AUDIT_EVENT_TYPES.staffEnable,
        before,
        after,
        actorStaffUserId,
        cleanReason,
        context
      );

      return after;
    });
  }

  async grantRole(staffUserId: number, roleCode: string, actorStaffUserId: number, reason: string, context: AdminAuditRequestContext): Promise<AdminStaffAccount> {
    return this.changeRole('grant', staffUserId, roleCode, actorStaffUserId, reason, context);
  }

  async revokeRole(staffUserId: number, roleCode: string, actorStaffUserId: number, reason: string, context: AdminAuditRequestContext): Promise<AdminStaffAccount> {
    return this.changeRole('revoke', staffUserId, roleCode, actorStaffUserId, reason, context);
  }

  private async changeRole(action: StaffRoleAction, staffUserId: number, roleCode: string, actorStaffUserId: number, reason: string, context: AdminAuditRequestContext): Promise<AdminStaffAccount> {
    const cleanReason = validateActionReason(reason, action === 'grant' ? 'role grant' : 'role revoke');

    return this.auditActions.run(async ({ db, audit }) => {
      const isLastActiveSuperAdmin = action === 'revoke'
        ? await this.staff.lockAndCheckLastActiveSuperAdmin(staffUserId, db)
        : false;

      if (action === 'revoke' && staffUserId === actorStaffUserId && !isLastActiveSuperAdmin)
        throw forbidden('Staff users cannot revoke their own roles', 'STAFF_ROLE_REVOKE_SELF_FORBIDDEN');

      const before = await this.requireStaff(staffUserId, db);
      const role = await this.requireRole(roleCode, db);
      const hasRole = before.roles.some((candidate) => candidate.id === role.id);

      if (action === 'revoke' && role.code === SUPER_ADMIN_ROLE_CODE && isLastActiveSuperAdmin)
        throw lastActiveSuperAdminConflict();
      if (action === 'revoke' && staffUserId === actorStaffUserId)
        throw forbidden('Staff users cannot revoke their own roles', 'STAFF_ROLE_REVOKE_SELF_FORBIDDEN');
      if (action === 'grant' && hasRole)
        throw conflict('Staff role is already granted', 'STAFF_ROLE_ALREADY_GRANTED');
      if (action === 'revoke' && !hasRole)
        throw conflict('Staff role is not granted', 'STAFF_ROLE_NOT_GRANTED');

      const changed = action === 'grant'
        ? await this.staff.grantRole(staffUserId, role.id, db)
        : await this.staff.revokeRole(staffUserId, role.id, db);
      if (!changed)
        throw conflict('Staff role assignment changed concurrently', 'STAFF_ROLE_CONFLICT');

      const after = await this.requireStaff(staffUserId, db);
      await audit.record({
        actorUserId: actorStaffUserId,
        eventType: action === 'grant' ? ADMIN_AUDIT_EVENT_TYPES.staffRoleGrant : ADMIN_AUDIT_EVENT_TYPES.staffRoleRevoke,
        targetType: ADMIN_AUDIT_TARGET_TYPES.staffUser,
        targetId: staffUserId,
        reason: cleanReason,
        beforeValues: snapshotStaff(before),
        afterValues: {
          ...snapshotStaff(after),
          changedRole: role.code
        },
        ...context
      });

      return after;
    });
  }

  private async requireStaff(staffUserId: number, db: Parameters<AdminStaffRepository['findById']>[1]): Promise<AdminStaffAccount> {
    const account = await this.staff.findById(staffUserId, db);

    if (!account)
      throw notFound('Staff user not found', 'STAFF_USER_NOT_FOUND');

    return account;
  }

  private async requireRole(roleCode: string, db: Parameters<AdminStaffRepository['findRoleByCode']>[1]): Promise<AdminStaffRole> {
    const role = await this.staff.findRoleByCode(roleCode, db);

    if (!role)
      throw notFound('Staff role not found', 'STAFF_ROLE_NOT_FOUND');

    return role;
  }

  private async recordLifecycleAudit(audit: AdminAuditRecorder, eventType: typeof ADMIN_AUDIT_EVENT_TYPES.staffDisable | typeof ADMIN_AUDIT_EVENT_TYPES.staffEnable, before: AdminStaffAccount, after: AdminStaffAccount, actorStaffUserId: number, reason: string, context: AdminAuditRequestContext, revokedSessionCount?: number): Promise<void> {
    await audit.record({
      actorUserId: actorStaffUserId,
      eventType,
      targetType: ADMIN_AUDIT_TARGET_TYPES.staffUser,
      targetId: before.id,
      reason,
      beforeValues: snapshotStaff(before),
      afterValues: {
        ...snapshotStaff(after),
        ...(revokedSessionCount === undefined ? {} : { revokedSessionCount })
      },
      ...context
    });
  }
}

function lastActiveSuperAdminConflict() {
  return conflict(
    'The last active SuperAdmin cannot be disabled or lose the SuperAdmin role',
    'LAST_ACTIVE_SUPER_ADMIN'
  );
}

function snapshotStaff(account: AdminStaffAccount) {
  return {
    status: account.status,
    roleCodes: account.roles.map((role) => role.code),
    activeSessionCount: account.activeSessionCount,
    disabledByStaffUserId: account.disabledByStaffUserId,
    disabledAt: account.disabledAt?.toISOString() ?? null
  };
}

function validateActionReason(reason: string, action: StaffLifecycleAction | 'role grant' | 'role revoke'): string {
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  const label = action.split(' ').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
  const codePrefix = `STAFF_${action.replace(' ', '_').toUpperCase()}`;

  if (!cleanReason)
    throw badRequest(`${label} reason is required`, `${codePrefix}_MISSING_REASON`);
  if (cleanReason.length < ACTION_REASON_MIN_LENGTH)
    throw badRequest(
      `${label} reason must be at least ${ACTION_REASON_MIN_LENGTH} characters`,
      `${codePrefix}_REASON_TOO_SHORT`
    );
  if (cleanReason.length > ACTION_REASON_MAX_LENGTH)
    throw badRequest(
      `${label} reason must be at most ${ACTION_REASON_MAX_LENGTH} characters`,
      `${codePrefix}_REASON_TOO_LONG`
    );

  return cleanReason;
}
