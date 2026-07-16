import { notFound } from '../../utils/errors.js';

import type { SessionRepository, StaffSession } from '../../repositories/auth/session.repository.interface.js';
import type { UserRepository } from '../../repositories/users/user.repository.interface.js';

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
  constructor(
    private readonly sessions: SessionRepository,
    private readonly users: Pick<UserRepository, 'findById'>
  ) { }

  async listOwn(staffUserId: number, currentSessionId: string): Promise<StaffSessionDto[]> {
    return this.listForUser(staffUserId, currentSessionId);
  }

  async revokeOwn(staffUserId: number, sessionId: string): Promise<void> {
    const revoked = await this.sessions.revokeStaffSession({
      id: sessionId,
      staffUserId,
      revokedByStaffUserId: staffUserId,
      revocationType: 'self'
    });

    if (!revoked)
      throw notFound('Active staff session not found', 'STAFF_SESSION_NOT_FOUND');
  }

  async listManaged(
    targetStaffUserId: number,
    currentStaffUserId: number,
    currentSessionId: string
  ): Promise<ManagedStaffSessionsDto> {
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

  async revokeManaged(targetStaffUserId: number, sessionId: string, actorStaffUserId: number): Promise<void> {
    await this.requireStaffUser(targetStaffUserId);

    const revoked = await this.sessions.revokeStaffSession({
      id: sessionId,
      staffUserId: targetStaffUserId,
      revokedByStaffUserId: actorStaffUserId,
      revocationType: 'admin'
    });

    if (!revoked)
      throw notFound('Active staff session not found', 'STAFF_SESSION_NOT_FOUND');
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
}
