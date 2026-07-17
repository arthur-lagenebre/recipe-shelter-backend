import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';

import { adminAuthorizationPolicies } from '../../src/api/admin/admin.authorization.js';
import { createStaffInvitationsController } from '../../src/api/admin/staff-invitations.controller.js';
import { createStaffInvitationsRouter } from '../../src/api/admin/staff-invitations.routes.js';
import { EnforceAuthorizationPolicies } from '../../src/middlewares/authorization.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { configureAuthRbacRepository, configureAuthSessionRepository, configureAuthUserRepository, requireStaffAuth } from '../../src/middlewares/require-auth.js';
import { PERMISSIONS } from '../../src/security/permissions.js';
import { StaffInvitationService } from '../../src/services/admin/staff-invitation.service.js';
import { TestAdminAuditRecorder } from '../helpers/admin-audit.js';
import { TestSessionRepository } from '../helpers/auth-session.js';
import { startHttpTestServer } from '../helpers/http-test-server.js';

import type { CreateStaffInvitationInput, CreateStaffInvitationResult, StaffInvitationRepository } from '../../src/repositories/admin/staff-invitation.repository.interface.js';
import type { User } from '../../src/repositories/users/user.types.js';
import type { StaffInvitationMailInput } from '../../src/services/mail/mail.types.js';
import type { HttpTestServer } from '../helpers/http-test-server.js';

const actor: User = {
  id: 9,
  mail: 'super-admin@example.com',
  username: 'Super Admin',
  accountType: 'staff',
  status: 'active',
  emailValidatedAt: new Date('2026-07-17T08:00:00.000Z'),
  bannedByUserId: null,
  bannedReason: null,
  bannedAt: null,
  createdAt: new Date('2026-07-17T08:00:00.000Z'),
  updatedAt: new Date('2026-07-17T08:00:00.000Z')
};

const createdInvitation = {
  id: 7,
  staffUserId: 42,
  email: 'staff.member@example.com',
  displayName: 'Staff Member',
  status: 'invited' as const,
  roles: [{ id: 3, code: 'UserAdmin', name: 'Administrateur des utilisateurs' }],
  expiresAt: new Date('2026-07-18T10:00:00.000Z'),
  createdAt: new Date('2026-07-17T10:00:00.000Z')
};

class HttpStaffInvitationRepository implements StaffInvitationRepository {
  result: CreateStaffInvitationResult = { status: 'created', invitation: createdInvitation };
  inputs: CreateStaffInvitationInput[] = [];

  async create(input: CreateStaffInvitationInput): Promise<CreateStaffInvitationResult> {
    this.inputs.push(input);
    return this.result;
  }
}

describe('POST /api/v1/admin/staff/invitations', () => {
  let server: HttpTestServer;
  let cookie: string;
  let staleCookie: string;
  let repository: HttpStaffInvitationRepository;
  let messages: StaffInvitationMailInput[];
  let audit: TestAdminAuditRecorder;

  before(async () => {
    configureAuthUserRepository({
      async findById(id) {
        return id === actor.id ? actor : null;
      }
    });
    configureAuthRbacRepository({
      async findPermissionCodesByStaffUserId() {
        return [PERMISSIONS.staffCreate];
      }
    });
    const sessions = new TestSessionRepository();
    configureAuthSessionRepository(sessions);
    cookie = await sessions.issueCookie(actor, 'admin');
    staleCookie = await sessions.issueCookie(actor, 'admin', {
      mfaVerifiedAt: new Date(Date.now() - 301_000)
    });

    repository = new HttpStaffInvitationRepository();
    messages = [];
    audit = new TestAdminAuditRecorder();
    const service = new StaffInvitationService(repository, {
      async sendStaffInvitationEmail(input) {
        messages.push(input);
      }
    }, audit, 'https://front.example', {
      invitationTtlMinutes: 1440,
      generateToken: () => 'http-invitation-token',
      hashToken: () => 'a'.repeat(64)
    });
    const controller = createStaffInvitationsController(service);
    const app = express();
    const adminRouter = express.Router();

    app.use(cookieParser());
    app.use(express.json());
    adminRouter.use(requireStaffAuth, EnforceAuthorizationPolicies(adminAuthorizationPolicies));
    adminRouter.use('/staff/invitations', createStaffInvitationsRouter(controller));
    app.use('/api/v1/admin', adminRouter);
    app.use(errorHandler);
    server = await startHttpTestServer(app);
  });

  after(async () => server.close());

  it('creates the invitation with the authenticated actor and returns 201', async () => {
    const response = await fetch(`${server.baseUrl}/api/v1/admin/staff/invitations`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
        'user-agent': 'Recipe Shelter integration client'
      },
      body: JSON.stringify({
        email: ' Staff.Member@Example.COM ',
        displayName: ' Staff Member ',
        roles: ['UserAdmin']
      })
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      id: 7,
      staffUserId: 42,
      email: 'staff.member@example.com',
      displayName: 'Staff Member',
      status: 'invited',
      roles: [{ id: 3, code: 'UserAdmin', name: 'Administrateur des utilisateurs' }],
      expiresAt: '2026-07-18T10:00:00.000Z',
      createdAt: '2026-07-17T10:00:00.000Z'
    });
    assert.equal(repository.inputs[0]?.createdByStaffUserId, actor.id);
    assert.equal(messages.length, 1);
    assert.equal(audit.inputs[0]?.actorUserId, actor.id);
    assert.equal(audit.inputs[0]?.userAgent, 'Recipe Shelter integration client');
  });

  it('rejects staff creation without a recent strong authentication proof', async () => {
    const repositoryCallsBefore = repository.inputs.length;
    const messagesBefore = messages.length;
    const auditCallsBefore = audit.inputs.length;
    const response = await fetch(`${server.baseUrl}/api/v1/admin/staff/invitations`, {
      method: 'POST',
      headers: { cookie: staleCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'another.staff@example.com',
        displayName: 'Another Staff',
        roles: ['UserAdmin']
      })
    });

    assert.equal(response.status, 401);
    assert.equal(
      (await response.json() as { error: { code: string } }).error.code,
      'AUTH_RECENT_AUTHENTICATION_REQUIRED'
    );
    assert.equal(repository.inputs.length, repositoryCallsBefore);
    assert.equal(messages.length, messagesBefore);
    assert.equal(audit.inputs.length, auditCallsBefore);
  });

  it('returns stable validation and existing-invitation errors without side effects', async () => {
    const callsBefore = repository.inputs.length;
    const invalid = await fetch(`${server.baseUrl}/api/v1/admin/staff/invitations`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'invalid', displayName: 'Staff Member', roles: ['UserAdmin'] })
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json() as { error: { code: string } }).error.code, 'STAFF_INVITATION_EMAIL_INVALID');
    assert.equal(repository.inputs.length, callsBefore);

    repository.result = { status: 'invitation_exists', invitationId: 7 };
    const conflict = await fetch(`${server.baseUrl}/api/v1/admin/staff/invitations`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'staff.member@example.com', displayName: 'Other Name', roles: ['UserAdmin'] })
    });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json() as { error: { code: string } }).error.code, 'STAFF_INVITATION_ALREADY_EXISTS');
    assert.equal(messages.length, 1);
    assert.equal(audit.inputs.length, 1);
  });
});
