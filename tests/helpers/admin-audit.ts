import type {
    AdminAuditRecordInput,
    AdminAuditRecordReceipt,
    AdminAuditRecorder,
    AdminAuditRequestContext
} from '../../src/services/admin/admin.audit.service.js';
import type { AdminAuditActionRunner, AdminAuditActionScope } from '../../src/services/admin/admin.audit-action.runner.js';
import type { PoolConnection } from 'mysql2/promise';

export const testAdminAuditContext: AdminAuditRequestContext = {
    ipAddress: '192.0.2.80',
    userAgent: 'Recipe Shelter test client',
    correlationId: '00000000-0000-4000-8000-000000000803'
};

export class TestAdminAuditRecorder implements AdminAuditRecorder, AdminAuditActionRunner {
    inputs: AdminAuditRecordInput[] = [];
    error: Error | null = null;

    async record(input: AdminAuditRecordInput): Promise<AdminAuditRecordReceipt> {
        if (this.error) throw this.error;

        this.inputs.push(input);
        return {
            id: this.inputs.length,
            correlationId: input.correlationId ?? testAdminAuditContext.correlationId!
        };
    }

    async run<T>(action: (scope: AdminAuditActionScope) => Promise<T>): Promise<T> {
        return action({ db: {} as PoolConnection, audit: this });
    }
}
