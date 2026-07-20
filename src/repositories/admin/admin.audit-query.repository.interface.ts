import type { AdminAuditLog, AdminAuditLogFilters } from './admin.audit-query.types.js';
import type { PaginatedResult, PaginationOptions } from '../../utils/pagination.js';

/** Read-only investigation boundary, deliberately separate from append-only audit writes. */
export interface AdminAuditQueryRepository {
  find(filters: AdminAuditLogFilters, pagination: PaginationOptions): Promise<PaginatedResult<AdminAuditLog>>;
}
