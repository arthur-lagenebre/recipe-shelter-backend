import { badRequest, notFound } from '../../utils/errors.js';
import { ADMIN_AUDIT_EVENT_TYPES, ADMIN_AUDIT_TARGET_TYPES } from '../admin/admin.audit.events.js';

import type { SessionRepository, StaffSession } from '../../repositories/auth/session.repository.interface.js';
import type { UserRepository } from '../../repositories/users/user.repository.interface.js';
import type { AdminAuditActionRunner } from '../admin/admin.audit-action.runner.js';
import type { AdminAuditRecorder, AdminAuditRequestContext } from '../admin/admin.audit.service.js';
import type { PoolConnection } from 'mysql2/promise';

const MANAGED_REVOCATION_REASON_MIN_LENGTH = 10;
const MANAGED_REVOCATION_REASON_MAX_LENGTH = 1000;

export type StaffSessionDto = StaffSession & {
  isCurrent: boolean;
};

export type ManagedStaffSessionsDto = {
  staff: {
    id: number;
    username: string;
  };
  sessions: StaffSessionDto[];
};

export class StaffSessionService {
  constructor(private readonly sessions: SessionRepository, private readonly users: Pick<UserRepository, 'findById'>, private readonly auditActions: AdminAuditActionRunner) { }

  async listOwn(staffUserId: number, currentSessionId: string): Promise<StaffSessionDto[]> {
    return this.listForUser(staffUserId, currentSessionId);
  }

  async revokeOwn(staffUserId: number, sessionId: string, context: AdminAuditRequestContext): Promise<void> {
    await this.auditActions.run(async ({ db, audit }) => {
      const revoked = await this.sessions.revokeStaffSession({
        id: sessionId,
        staffUserId,
        revokedByStaffUserId: staffUserId,
        revocationType: 'self'
      }, db);

      if (!revoked)
        throw notFound('Active staff session not found', 'STAFF_SESSION_NOT_FOUND');

      await this.recordRevocation(audit, sessionId, staffUserId, staffUserId, 'self', context);
    });
  }

  async listManaged(targetStaffUserId: number, currentStaffUserId: number, currentSessionId: string, context: AdminAuditRequestContext): Promise<ManagedStaffSessionsDto> {
    return this.auditActions.run(async ({ db, audit }) => {
      const staff = await this.requireStaffUser(targetStaffUserId, db);
      const sessions = await this.listForUser(targetStaffUserId, targetStaffUserId === currentStaffUserId ? currentSessionId : '', db);

      await audit.record({
        actorUserId: currentStaffUserId,
        eventType: ADMIN_AUDIT_EVENT_TYPES.staffSessionList,
        targetType: ADMIN_AUDIT_TARGET_TYPES.staffUser,
        targetId: targetStaffUserId,
        afterValues: { activeSessionCount: sessions.length },
        ...context
      });

      return {
        staff: { id: staff.id, username: staff.username },
        sessions
      };
    });
  }

  async revokeManaged(targetStaffUserId: number, sessionId: string, actorStaffUserId: number, reason: string, context: AdminAuditRequestContext): Promise<void> {
    const cleanReason = validateManagedRevocationReason(reason);

    await this.auditActions.run(async ({ db, audit }) => {
      await this.requireStaffUser(targetStaffUserId, db);
      const revoked = await this.sessions.revokeStaffSession({
        id: sessionId,
        staffUserId: targetStaffUserId,
        revokedByStaffUserId: actorStaffUserId,
        revocationType: 'suspected_compromise'
      }, db);

      if (!revoked)
        throw notFound('Active staff session not found', 'STAFF_SESSION_NOT_FOUND');

      await this.recordRevocation(audit, sessionId, targetStaffUserId, actorStaffUserId, 'suspected_compromise', context, cleanReason);
    });
  }

  private async listForUser(staffUserId: number, currentSessionId: string, db?: PoolConnection): Promise<StaffSessionDto[]> {
    const sessions = await this.sessions.findActiveStaffSessionsByUserId(staffUserId, db);

    return sessions.map((session) => ({
      ...session,
      isCurrent: session.id === currentSessionId
    }));
  }

  private async requireStaffUser(staffUserId: number, db?: PoolConnection) {
    const user = await this.users.findById(staffUserId, db);

    if (!user || user.accountType !== 'staff')
      throw notFound('Staff user not found', 'STAFF_USER_NOT_FOUND');

    return user;
  }

  private async recordRevocation(audit: AdminAuditRecorder, sessionId: string, targetStaffUserId: number, actorStaffUserId: number, revocationType: 'suspected_compromise' | 'self', context: AdminAuditRequestContext, reason?: string): Promise<void> {
    await audit.record({
      actorUserId: actorStaffUserId,
      eventType: ADMIN_AUDIT_EVENT_TYPES.staffSessionRevoke,
      targetType: ADMIN_AUDIT_TARGET_TYPES.staffSession,
      targetId: sessionId,
      reason,
      beforeValues: {
        staffUserId: targetStaffUserId,
        isRevoked: false
      },
      afterValues: {
        staffUserId: targetStaffUserId,
        isRevoked: true,
        revokedByStaffUserId: actorStaffUserId,
        revocationType
      },
      ...context
    });
  }
}

function validateManagedRevocationReason(reason: string): string {
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';

  if (!cleanReason)
    throw badRequest('Session revocation reason is required', 'STAFF_SESSION_REVOKE_MISSING_REASON');
  if (cleanReason.length < MANAGED_REVOCATION_REASON_MIN_LENGTH)
    throw badRequest(
      `Session revocation reason must be at least ${MANAGED_REVOCATION_REASON_MIN_LENGTH} characters`,
      'STAFF_SESSION_REVOKE_REASON_TOO_SHORT'
    );
  if (cleanReason.length > MANAGED_REVOCATION_REASON_MAX_LENGTH)
    throw badRequest(
      `Session revocation reason must be at most ${MANAGED_REVOCATION_REASON_MAX_LENGTH} characters`,
      'STAFF_SESSION_REVOKE_REASON_TOO_LONG'
    );

  return cleanReason;
}
