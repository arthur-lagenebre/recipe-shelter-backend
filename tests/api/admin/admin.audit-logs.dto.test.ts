import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseAdminAuditLogFilters } from '../../../src/api/admin/admin.audit-logs.dto.js';
import { HttpError } from '../../../src/utils/errors.js';

describe('admin audit logs DTO', () => {
    it('parses every investigation filter and normalizes identifiers', () => {
        assert.deepEqual(
            parseAdminAuditLogFilters({
                actorUserId: '42',
                action: ' users.ban ',
                targetType: ' community_user ',
                targetId: ' 108 ',
                from: '2026-07-01T00:00:00.000Z',
                to: '2026-07-17T23:59:59+02:00',
                correlationId: ' 00000000-0000-4000-8000-0000000000AB '
            }),
            {
                actorUserId: 42,
                action: 'users.ban',
                targetType: 'community_user',
                targetId: '108',
                from: new Date('2026-07-01T00:00:00.000Z'),
                to: new Date('2026-07-17T23:59:59+02:00'),
                correlationId: '00000000-0000-4000-8000-0000000000ab'
            }
        );
    });

    it('returns no implicit filter for a pagination-only query', () => {
        assert.deepEqual(parseAdminAuditLogFilters({ page: '1', limit: '25' }), {});
    });

    it('rejects unknown actor, action, target and correlation values', () => {
        const invalidFilters: Array<[Record<string, unknown>, string]> = [
            [{ actorUserId: '0' }, 'ADMIN_AUDIT_LOGS_BAD_ACTOR'],
            [{ actorUserId: '9007199254740992' }, 'ADMIN_AUDIT_LOGS_BAD_ACTOR'],
            [{ action: 'users.password.read' }, 'ADMIN_AUDIT_LOGS_BAD_ACTION'],
            [{ targetType: 'credential' }, 'ADMIN_AUDIT_LOGS_BAD_TARGET_TYPE'],
            [{ targetId: '' }, 'ADMIN_AUDIT_LOGS_BAD_TARGET_ID'],
            [{ targetId: 'x'.repeat(256) }, 'ADMIN_AUDIT_LOGS_BAD_TARGET_ID'],
            [{ correlationId: 'not-a-uuid' }, 'ADMIN_AUDIT_LOGS_BAD_CORRELATION_ID']
        ];

        for (const [query, code] of invalidFilters) {
            assert.throws(
                () => parseAdminAuditLogFilters(query),
                (error) => assertHttpError(error, code)
            );
        }
    });

    it('rejects malformed and reversed periods', () => {
        assert.throws(
            () => parseAdminAuditLogFilters({ from: '2026-07-01' }),
            (error) => assertHttpError(error, 'ADMIN_AUDIT_LOGS_BAD_FROM')
        );
        assert.throws(
            () => parseAdminAuditLogFilters({ to: 'tomorrow' }),
            (error) => assertHttpError(error, 'ADMIN_AUDIT_LOGS_BAD_TO')
        );
        assert.throws(
            () =>
                parseAdminAuditLogFilters({
                    from: '2026-07-18T00:00:00Z',
                    to: '2026-07-17T00:00:00Z'
                }),
            (error) => assertHttpError(error, 'ADMIN_AUDIT_LOGS_BAD_PERIOD')
        );
    });
});

function assertHttpError(error: unknown, code: string): boolean {
    assert.ok(error instanceof HttpError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, code);

    return true;
}
