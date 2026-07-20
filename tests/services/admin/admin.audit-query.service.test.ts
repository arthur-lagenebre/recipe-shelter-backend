import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AdminAuditQueryService } from '../../../src/services/admin/admin.audit-query.service.js';
import { createPaginatedResult } from '../../../src/utils/pagination.js';

import type { AdminAuditQueryRepository } from '../../../src/repositories/admin/admin.audit-query.repository.interface.js';
import type { AdminAuditLogFilters } from '../../../src/repositories/admin/admin.audit-query.types.js';
import type { PaginationOptions } from '../../../src/utils/pagination.js';

describe('AdminAuditQueryService', () => {
    it('delegates the validated investigation query without using the write service', async () => {
        const received: Array<{ filters: AdminAuditLogFilters; pagination: PaginationOptions }> = [];
        const repository: AdminAuditQueryRepository = {
            async find(filters, pagination) {
                received.push({ filters, pagination });
                return createPaginatedResult([], 0, pagination);
            }
        };
        const filters: AdminAuditLogFilters = { actorUserId: 7, action: 'users.ban' };
        const pagination = { page: 1, limit: 25, offset: 0 };

        const result = await new AdminAuditQueryService(repository).list(filters, pagination);

        assert.deepEqual(received, [{ filters, pagination }]);
        assert.deepEqual(result.items, []);
        assert.equal(result.pagination.limit, 25);
    });
});
