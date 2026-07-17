import type { AdminAuditQueryRepository } from '../../repositories/admin/admin-audit-query.repository.interface.js';
import type { AdminAuditLog, AdminAuditLogFilters } from '../../repositories/admin/admin-audit-query.types.js';
import type { PaginatedResult, PaginationOptions } from '../../utils/pagination.js';

export class AdminAuditQueryService {
  constructor(private readonly auditLogs: AdminAuditQueryRepository) { }

  async list(filters: AdminAuditLogFilters, pagination: PaginationOptions): Promise<PaginatedResult<AdminAuditLog>> {
    return this.auditLogs.find(filters, pagination);
  }
}
