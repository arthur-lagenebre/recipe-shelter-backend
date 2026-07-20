import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';

import { createAdminAuditLogsController } from '../../src/api/admin/admin-audit-logs.controller.js';
import { createAdminAuditLogsRouter } from '../../src/api/admin/admin-audit-logs.routes.js';
import { adminAuthorizationPolicies } from '../../src/api/admin/admin.authorization.js';
import { EnforceAuthorizationPolicies } from '../../src/middlewares/authorization.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { configureAuthRbacRepository, configureAuthSessionRepository, configureAuthUserRepository, requireStaffAuth } from '../../src/middlewares/require-auth.js';
import { PERMISSIONS } from '../../src/security/permissions.js';
import { createPaginatedResult } from '../../src/utils/pagination.js';
import { TestSessionRepository } from '../helpers/auth-session.js';
import { startHttpTestServer } from '../helpers/http-test-server.js';

import type { AdminAuditLogFilters } from '../../src/repositories/admin/admin-audit-query.types.js';
import type { User } from '../../src/repositories/users/user.types.js';
import type { PermissionCode } from '../../src/security/permissions.js';
import type { PaginationOptions } from '../../src/utils/pagination.js';
import type { HttpTestServer } from '../helpers/http-test-server.js';

const staff: User = {
  id: 7,
  mail: 'audit-reader@example.test',
  username: 'audit-reader',
  accountType: 'staff',
  status: 'active',
  emailValidatedAt: new Date('2026-07-17T08:00:00.000Z'),
  bannedByUserId: null,
  bannedReason: null,
  bannedAt: null,
  createdAt: new Date('2026-07-17T08:00:00.000Z'),
  updatedAt: new Date('2026-07-17T08:00:00.000Z')
};

describe('admin audit logs HTTP integration', () => {
  let server: HttpTestServer;
  let cookie: string;
  let grantedPermissions: PermissionCode[] = [];
  let receivedQuery: { filters: AdminAuditLogFilters; pagination: PaginationOptions } | null = null;

  before(async () => {
    configureAuthUserRepository({
      async findById(id) {
        return id === staff.id ? staff : null;
      }
    });
    configureAuthRbacRepository({
      async findPermissionCodesByStaffUserId() {
        return [...grantedPermissions];
      }
    });
    const sessions = new TestSessionRepository();
    configureAuthSessionRepository(sessions);

    const service = {
      async list(filters: AdminAuditLogFilters, pagination: PaginationOptions) {
        receivedQuery = { filters, pagination };

        return createPaginatedResult([{
          id: 82,
          actor: { id: 7, username: 'audit-reader' },
          action: 'users.ban' as const,
          target: { type: 'community_user' as const, id: '42' },
          reason: 'Repeated abuse confirmed.',
          beforeValues: { status: 'active', passwordHash: '[REDACTED]' },
          afterValues: { status: 'banned' },
          correlationId: '00000000-0000-4000-8000-000000000082',
          createdAt: new Date('2026-07-17T10:30:00.000Z')
        }], 51, pagination);
      }
    };
    const app = express();
    const adminRouter = express.Router();

    app.use(cookieParser());
    adminRouter.use(requireStaffAuth, EnforceAuthorizationPolicies(adminAuthorizationPolicies));
    adminRouter.use('/audit-logs', createAdminAuditLogsRouter(createAdminAuditLogsController(service)));
    app.use('/api/v1/admin', adminRouter);
    app.use(errorHandler);

    cookie = await sessions.issueCookie(staff, 'admin');
    server = await startHttpTestServer(app);
  });

  after(async () => server.close());

  it('returns a filtered paginated and minimized investigation view with audit.read', async () => {
    grantedPermissions = [PERMISSIONS.auditRead];
    const query = new URLSearchParams({
      actorUserId: '7',
      action: 'users.ban',
      targetType: 'community_user',
      targetId: '42',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-17T23:59:59+02:00',
      correlationId: '00000000-0000-4000-8000-000000000082',
      page: '2',
      limit: '25'
    });
    const response = await fetch(`${server.baseUrl}/api/v1/admin/audit-logs?${query}`, {
      headers: { cookie }
    });
    const body = await response.json() as {
      items: Array<Record<string, unknown>>;
      pagination: Record<string, unknown>;
    };

    assert.equal(response.status, 200);
    assert.deepEqual(receivedQuery, {
      filters: {
        actorUserId: 7,
        action: 'users.ban',
        targetType: 'community_user',
        targetId: '42',
        from: new Date('2026-07-01T00:00:00.000Z'),
        to: new Date('2026-07-17T23:59:59+02:00'),
        correlationId: '00000000-0000-4000-8000-000000000082'
      },
      pagination: { page: 2, limit: 25, offset: 25 }
    });
    assert.deepEqual(body.pagination, {
      page: 2,
      limit: 25,
      totalItems: 51,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true
    });
    assert.equal(body.items[0]?.action, 'users.ban');
    assert.equal('ipAddress' in (body.items[0] ?? {}), false);
    assert.equal('userAgent' in (body.items[0] ?? {}), false);
    assert.equal('email' in ((body.items[0]?.actor as Record<string, unknown>) ?? {}), false);
    assert.doesNotMatch(JSON.stringify(body), /audit-reader@example\.test/);
  });

  it('requires authentication and the exact audit.read permission', async () => {
    grantedPermissions = [PERMISSIONS.userRead];
    receivedQuery = null;

    const forbidden = await fetch(`${server.baseUrl}/api/v1/admin/audit-logs`, {
      headers: { cookie }
    });
    assert.equal(forbidden.status, 403);
    assert.equal((await forbidden.json() as { error: { code: string } }).error.code, 'AUTH_PERMISSION_REQUIRED');
    assert.equal(receivedQuery, null);

    const unauthorized = await fetch(`${server.baseUrl}/api/v1/admin/audit-logs`);
    assert.equal(unauthorized.status, 401);
    assert.equal((await unauthorized.json() as { error: { code: string } }).error.code, 'AUTH_NO_TOKEN');
    assert.equal(receivedQuery, null);
  });

  it('returns invalid filters and pagination in the standard error format', async () => {
    grantedPermissions = [PERMISSIONS.auditRead];

    const badPeriod = await fetch(`${server.baseUrl}/api/v1/admin/audit-logs?from=2026-07-18T00:00:00Z&to=2026-07-17T00:00:00Z`, {
      headers: { cookie }
    });
    assert.equal(badPeriod.status, 400);
    assert.equal((await badPeriod.json() as { error: { code: string } }).error.code, 'ADMIN_AUDIT_LOGS_BAD_PERIOD');

    const badPage = await fetch(`${server.baseUrl}/api/v1/admin/audit-logs?page=0`, {
      headers: { cookie }
    });
    assert.equal(badPage.status, 400);
    assert.equal((await badPage.json() as { error: { code: string } }).error.code, 'ADMIN_AUDIT_LOGS_PAGINATION_BAD_PAGE');
  });
});
