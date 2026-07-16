import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';

import { adminAuthorizationPolicies } from '../../src/api/admin/admin.authorization.js';
import { createStaffSessionsController } from '../../src/api/admin/staff-sessions.controller.js';
import { createAdminStaffSessionsRouter } from '../../src/api/admin/staff-sessions.routes.js';
import { createStaffAuthRouter } from '../../src/api/auth/auth.routes.js';
import { EnforceAuthorizationPolicies } from '../../src/middlewares/authorization.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { configureAuthRbacRepository, configureAuthSessionRepository, configureAuthUserRepository, requireStaffAuth } from '../../src/middlewares/require-auth.js';
import { PERMISSIONS } from '../../src/security/permissions.js';
import { StaffSessionService } from '../../src/services/auth/staff-session.service.js';
import { TestSessionRepository } from '../helpers/auth-session.js';
import { startHttpTestServer } from '../helpers/http-test-server.js';

import type { User } from '../../src/repositories/users/user.types.js';
import type { PermissionCode } from '../../src/security/permissions.js';
import type { HttpTestServer } from '../helpers/http-test-server.js';
import type { RequestHandler } from 'express';

const actor: User = {
  id: 1,
  mail: 'actor@example.com',
  username: 'actor-staff',
  accountType: 'staff',
  status: 'active',
  emailValidatedAt: new Date('2026-07-16T10:00:00.000Z'),
  bannedByUserId: null,
  bannedReason: null,
  bannedAt: null,
  createdAt: new Date('2026-07-16T10:00:00.000Z'),
  updatedAt: new Date('2026-07-16T10:00:00.000Z')
};

const target: User = {
  ...actor,
  id: 2,
  mail: 'target@example.com',
  username: 'target-staff'
};

const community: User = {
  ...actor,
  id: 3,
  mail: 'community@example.com',
  username: 'community-user',
  accountType: 'community'
};

describe('staff session management HTTP boundaries', () => {
  let server: HttpTestServer;
  let sessions: TestSessionRepository;
  let actorCookie: string;
  let communityCookie: string;
  let actorSessionId: string;
  let targetSessionId: string;
  let grantedPermissions: PermissionCode[] = [];

  before(async () => {
    const users = new Map<number, User>([
      [actor.id, actor],
      [target.id, target],
      [community.id, community]
    ]);
    sessions = new TestSessionRepository();
    configureAuthUserRepository({
      async findById(id) {
        return users.get(id) ?? null;
      }
    });
    configureAuthRbacRepository({
      async findPermissionCodesByStaffUserId() {
        return [...grantedPermissions];
      }
    });
    configureAuthSessionRepository(sessions);

    actorCookie = await sessions.issueCookie(actor, 'admin');
    await sessions.issueCookie(target, 'admin');
    communityCookie = await sessions.issueCookie(community, 'app');
    actorSessionId = findSessionId(sessions, actor.id);
    targetSessionId = findSessionId(sessions, target.id);

    const service = new StaffSessionService(sessions, {
      async findById(id) {
        return users.get(id) ?? null;
      }
    });
    const controller = createStaffSessionsController(service);
    const noOp: RequestHandler = (_req, res) => {
      res.status(204).send();
    };
    const authController = {
      register: noOp,
      login: noOp,
      staffLoginOptions: noOp,
      staffLoginVerify: noOp,
      staffMfaEnrollmentOptions: noOp,
      staffMfaEnrollmentVerify: noOp,
      me: noOp,
      logout: noOp,
      staffLogout: noOp,
      forgotPassword: noOp,
      resetPassword: noOp,
      validateEmail: noOp,
      resendValidationEmail: noOp
    };

    const app = express();
    app.use(cookieParser());
    const adminRouter = express.Router();
    adminRouter.use('/auth', createStaffAuthRouter(authController, controller));
    adminRouter.use(requireStaffAuth, EnforceAuthorizationPolicies(adminAuthorizationPolicies));
    adminRouter.use('/staff', createAdminStaffSessionsRouter(controller));
    app.use('/api/v1/admin', adminRouter);
    app.use(errorHandler);
    server = await startHttpTestServer(app);
  });

  after(async () => server.close());

  it('lists only the authenticated staff owner sessions and exposes no credential secret', async () => {
    grantedPermissions = [];
    const response = await fetch(`${server.baseUrl}/api/v1/admin/auth/sessions`, {
      headers: { cookie: actorCookie }
    });

    assert.equal(response.status, 200);
    const body = await response.json() as { sessions: Array<Record<string, unknown>> };
    assert.equal(body.sessions.length, 1);
    assert.equal(body.sessions[0]?.id, actorSessionId);
    assert.equal(body.sessions[0]?.isCurrent, true);
    assert.equal(body.sessions[0]?.mfaMethod, 'webauthn');
    assert.equal('webAuthnCredentialId' in (body.sessions[0] ?? {}), false);
    assert.doesNotMatch(JSON.stringify(body), /test-staff-credential|token|publicKey|challenge/i);

    const communityResponse = await fetch(`${server.baseUrl}/api/v1/admin/auth/sessions`, {
      headers: { cookie: communityCookie }
    });
    assert.equal(communityResponse.status, 401);
    assert.equal(
      (await communityResponse.json() as { error: { code: string } }).error.code,
      'AUTH_NO_TOKEN'
    );
  });

  it('does not let an owner revoke a different staff user session', async () => {
    const response = await fetch(`${server.baseUrl}/api/v1/admin/auth/sessions/${targetSessionId}`, {
      method: 'DELETE',
      headers: { cookie: actorCookie }
    });

    assert.equal(response.status, 404);
    assert.equal((await response.json() as { error: { code: string } }).error.code, 'STAFF_SESSION_NOT_FOUND');
    assert.equal(sessions.staffSessions.has(targetSessionId), true);
  });

  it('requires staff.read to inspect sessions administered for another staff identity', async () => {
    grantedPermissions = [];
    let response = await fetch(`${server.baseUrl}/api/v1/admin/staff/${target.id}/sessions`, {
      headers: { cookie: actorCookie }
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json() as { error: { code: string } }).error.code, 'AUTH_PERMISSION_REQUIRED');

    grantedPermissions = [PERMISSIONS.staffRead];
    response = await fetch(`${server.baseUrl}/api/v1/admin/staff/${target.id}/sessions`, {
      headers: { cookie: actorCookie }
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { staff: { id: number }; sessions: Array<{ id: string; isCurrent: boolean }> };
    assert.equal(body.staff.id, target.id);
    assert.deepEqual(body.sessions.map(({ id, isCurrent }) => ({ id, isCurrent })), [
      { id: targetSessionId, isCurrent: false }
    ]);
  });

  it('requires staff.session.revoke and revokes only the addressed staff session', async () => {
    grantedPermissions = [PERMISSIONS.staffRead];
    let response = await fetch(`${server.baseUrl}/api/v1/admin/staff/${target.id}/sessions/${targetSessionId}`, {
      method: 'DELETE',
      headers: { cookie: actorCookie }
    });
    assert.equal(response.status, 403);
    assert.equal(sessions.staffSessions.has(targetSessionId), true);

    grantedPermissions = [PERMISSIONS.staffSessionRevoke];
    response = await fetch(`${server.baseUrl}/api/v1/admin/staff/${target.id}/sessions/${targetSessionId}`, {
      method: 'DELETE',
      headers: { cookie: actorCookie }
    });
    assert.equal(response.status, 204);
    assert.equal(sessions.staffSessions.has(targetSessionId), false);
    assert.equal(sessions.staffSessions.has(actorSessionId), true);
    assert.deepEqual(sessions.staffRevocations.at(-1), {
      id: targetSessionId,
      staffUserId: target.id,
      revokedByStaffUserId: actor.id,
      revocationType: 'admin'
    });
  });

  it('clears the admin cookie when the current session revokes itself', async () => {
    grantedPermissions = [];
    const response = await fetch(`${server.baseUrl}/api/v1/admin/auth/sessions/${actorSessionId}`, {
      method: 'DELETE',
      headers: { cookie: actorCookie }
    });

    assert.equal(response.status, 204);
    assert.match(response.headers.get('set-cookie') ?? '', /Expires=Thu, 01 Jan 1970/i);
    assert.equal(sessions.staffSessions.has(actorSessionId), false);
  });
});

function findSessionId(sessions: TestSessionRepository, staffUserId: number): string {
  const entry = [...sessions.staffSessions.entries()].find(([, session]) => session.userId === staffUserId);
  assert.ok(entry);

  return entry[0];
}
