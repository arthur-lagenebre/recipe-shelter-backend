import type { AdminAuditRepository, CreateAdminAuditLogInput } from './admin-audit.repository.interface.js';
import type { Queryable } from '../../db/query.js';
import type { ResultSetHeader } from 'mysql2/promise';

export class AdminAuditRepositoryMysql implements AdminAuditRepository {
  constructor(private readonly db: Queryable) { }

  async create(input: CreateAdminAuditLogInput): Promise<number> {
    const [result] = await this.db.execute<ResultSetHeader>(
      `INSERT INTO AdminAuditLogs
         (ActorUserId, Action, TargetType, TargetId, Reason, BeforeValues, AfterValues,
          IpAddress, UserAgent, CorrelationId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.actorUserId,
        input.action,
        input.targetType,
        input.targetId,
        input.reason,
        input.beforeValues === null ? null : JSON.stringify(input.beforeValues),
        input.afterValues === null ? null : JSON.stringify(input.afterValues),
        input.ipAddress,
        input.userAgent,
        input.correlationId
      ]
    );

    return result.insertId;
  }
}
