import { mapAdminAuditLog } from './admin.audit-query.mapper.js';
import { firstOrNull } from '../../utils/array.js';
import { createPaginatedResult, formatLimitOffsetClause } from '../../utils/pagination.js';

import type { AdminAuditQueryRepository } from './admin.audit-query.repository.interface.js';
import type { AdminAuditLog, AdminAuditLogFilters, AdminAuditLogRow } from './admin.audit-query.types.js';
import type { Queryable } from '../../db/query.js';
import type { PaginatedResult, PaginationOptions } from '../../utils/pagination.js';

type AuditWhere = {
  clause: string;
  params: Array<Date | number | string>;
};

export class AdminAuditQueryRepositoryMysql implements AdminAuditQueryRepository {
  constructor(private readonly db: Queryable) { }

  async find(filters: AdminAuditLogFilters, pagination: PaginationOptions): Promise<PaginatedResult<AdminAuditLog>> {
    const where = buildWhere(filters);
    const limitOffsetClause = formatLimitOffsetClause(pagination);
    const [countRows] = await this.db.execute(
      `SELECT COUNT(*) AS Count
       FROM AdminAuditLogs AS audit
       WHERE ${where.clause}`,
      where.params
    );
    const [rows] = await this.db.execute(
      `SELECT audit.Id, audit.ActorUserId, actor.Username AS ActorUsername,
              audit.Action, audit.TargetType, audit.TargetId, audit.Reason,
              audit.BeforeValues, audit.AfterValues, audit.CorrelationId, audit.CreatedAt
       FROM AdminAuditLogs AS audit
       INNER JOIN Users AS actor ON actor.Id = audit.ActorUserId
       WHERE ${where.clause}
       ORDER BY audit.CreatedAt DESC, audit.Id DESC
       ${limitOffsetClause}`,
      where.params
    );

    const countRow = firstOrNull(countRows as Array<{ Count: number | string }>);
    const totalItems = countRow ? Number(countRow.Count) : 0;

    return createPaginatedResult(
      (rows as AdminAuditLogRow[]).map(mapAdminAuditLog),
      totalItems,
      pagination
    );
  }
}

function buildWhere(filters: AdminAuditLogFilters): AuditWhere {
  const clauses = ['1 = 1'];
  const params: Array<Date | number | string> = [];

  if (filters.actorUserId !== undefined) {
    clauses.push('audit.ActorUserId = ?');
    params.push(filters.actorUserId);
  }
  if (filters.action !== undefined) {
    clauses.push('audit.Action = ?');
    params.push(filters.action);
  }
  if (filters.targetType !== undefined) {
    clauses.push('audit.TargetType = ?');
    params.push(filters.targetType);
  }
  if (filters.targetId !== undefined) {
    clauses.push('audit.TargetId = ?');
    params.push(filters.targetId);
  }
  if (filters.from !== undefined) {
    clauses.push('audit.CreatedAt >= ?');
    params.push(filters.from);
  }
  if (filters.to !== undefined) {
    clauses.push('audit.CreatedAt <= ?');
    params.push(filters.to);
  }
  if (filters.correlationId !== undefined) {
    clauses.push('audit.CorrelationId = ?');
    params.push(filters.correlationId);
  }

  return { clause: clauses.join(' AND '), params };
}
