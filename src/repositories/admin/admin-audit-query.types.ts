import type { AdminAuditSnapshot } from './admin-audit.repository.interface.js';
import type { AdminAuditEventType, AdminAuditTargetType } from '../../services/admin/admin-audit.events.js';
import type { RowDataPacket } from 'mysql2';

export type AdminAuditLogFilters = {
  readonly actorUserId?: number;
  readonly action?: AdminAuditEventType;
  readonly targetType?: AdminAuditTargetType;
  readonly targetId?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly correlationId?: string;
};

export type AdminAuditLog = {
  id: number;
  actor: {
    id: number;
    username: string;
  };
  action: AdminAuditEventType;
  target: {
    type: AdminAuditTargetType;
    id: string;
  };
  reason: string | null;
  beforeValues: AdminAuditSnapshot | null;
  afterValues: AdminAuditSnapshot | null;
  correlationId: string;
  createdAt: Date;
};

export type AdminAuditLogRow = RowDataPacket & {
  Id: number;
  ActorUserId: number;
  ActorUsername: string;
  Action: AdminAuditEventType;
  TargetType: AdminAuditTargetType;
  TargetId: string;
  Reason: string | null;
  BeforeValues: AdminAuditSnapshot | null;
  AfterValues: AdminAuditSnapshot | null;
  CorrelationId: string;
  CreatedAt: Date;
};
