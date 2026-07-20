import { parseAdminAuditLogFilters } from './admin.audit-logs.dto.js';
import { parsePaginationQuery } from '../../utils/pagination.js';
import { asyncHandler } from '../http/async-handler.js';

import type { AdminAuditQueryService } from '../../services/admin/admin.audit-query.service.js';

const DEFAULT_AUDIT_LOG_LIMIT = 25;

export function createAdminAuditLogsController(auditLogs: Pick<AdminAuditQueryService, 'list'>) {
    return {
        list: asyncHandler(async (req, res) => {
            const filters = parseAdminAuditLogFilters(req.query);
            const pagination = parsePaginationQuery(req.query, DEFAULT_AUDIT_LOG_LIMIT, 'ADMIN_AUDIT_LOGS_PAGINATION');
            const result = await auditLogs.list(filters, pagination);

            res.status(200).json(result);
        })
    };
}
