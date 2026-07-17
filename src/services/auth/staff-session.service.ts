import { notFound } from '../../utils/errors.js';
import { ADMIN_AUDIT_EVENT_TYPES, ADMIN_AUDIT_TARGET_TYPES } from '../admin/admin-audit.events.js';

import type { SessionRepository, StaffSession } from '../../repositories/auth/session.repository.interface.js';
import type { UserRepository } from '../../repositories/users/user.repository.interface.js';
import type { AdminAuditActionRunner } from '../admin/admin-audit-action.runner.js';
import type { AdminAuditRecorder, AdminAuditRequestContext } from '../admin/admin-audit.service.js';

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

  async listManaged(targetStaffUserId: number, currentStaffUserId: number, currentSessionId: string): Promise<ManagedStaffSessionsDto> {
    const staff = await this.requireStaffUser(targetStaffUserId);
    const sessions = await this.listForUser(
      targetStaffUserId,
      targetStaffUserId === currentStaffUserId ? currentSessionId : ''
    );

    return {
      staff: { id: staff.id, username: staff.username },
      sessions
    };
  }

  async revokeManaged(targetStaffUserId: number, sessionId: string, actorStaffUserId: number, context: AdminAuditRequestContext): Promise<void> {
    await this.requireStaffUser(targetStaffUserId);

    await this.auditActions.run(async ({ db, audit }) => {
      const revoked = await this.sessions.revokeStaffSession({
        id: sessionId,
        staffUserId: targetStaffUserId,
        revokedByStaffUserId: actorStaffUserId,
        revocationType: 'admin'
      }, db);

      if (!revoked)
        throw notFound('Active staff session not found', 'STAFF_SESSION_NOT_FOUND');

      await this.recordRevocation(audit, sessionId, targetStaffUserId, actorStaffUserId, 'admin', context);
    });
  }

  private async listForUser(staffUserId: number, currentSessionId: string): Promise<StaffSessionDto[]> {
    const sessions = await this.sessions.findActiveStaffSessionsByUserId(staffUserId);

    return sessions.map((session) => ({
      ...session,
      isCurrent: session.id === currentSessionId
    }));
  }

  private async requireStaffUser(staffUserId: number) {
    const user = await this.users.findById(staffUserId);

    if (!user || user.accountType !== 'staff')
      throw notFound('Staff user not found', 'STAFF_USER_NOT_FOUND');

    return user;
  }

  private async recordRevocation(audit: AdminAuditRecorder, sessionId: string, targetStaffUserId: number, actorStaffUserId: number, revocationType: 'admin' | 'self', context: AdminAuditRequestContext): Promise<void> {
    await audit.record({
      actorUserId: actorStaffUserId,
      eventType: ADMIN_AUDIT_EVENT_TYPES.staffSessionRevoke,
      targetType: ADMIN_AUDIT_TARGET_TYPES.staffSession,
      targetId: sessionId,
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
