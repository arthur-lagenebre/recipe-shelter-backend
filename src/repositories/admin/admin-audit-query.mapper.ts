import type { AdminAuditLog, AdminAuditLogRow } from './admin-audit-query.types.js';

export function mapAdminAuditLog(row: AdminAuditLogRow): AdminAuditLog {
  return {
    id: row.Id,
    actor: {
      id: row.ActorUserId,
      username: row.ActorUsername
    },
    action: row.Action,
    target: {
      type: row.TargetType,
      id: row.TargetId
    },
    reason: row.Reason,
    beforeValues: row.BeforeValues,
    afterValues: row.AfterValues,
    correlationId: row.CorrelationId,
    createdAt: row.CreatedAt
  };
}
