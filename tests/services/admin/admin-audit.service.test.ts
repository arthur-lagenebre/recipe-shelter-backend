import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { ADMIN_AUDIT_EVENT_TYPES, ADMIN_AUDIT_TARGET_TYPES } from '../../../src/services/admin/admin-audit.events.js';
import { ADMIN_AUDIT_FAILURE_POLICY, AdminAuditService } from '../../../src/services/admin/admin-audit.service.js';
import { HttpError } from '../../../src/utils/errors.js';
import { logger } from '../../../src/utils/logger.js';

import type { AdminAuditRepository, AdminAuditSnapshot, CreateAdminAuditLogInput } from '../../../src/repositories/admin/admin-audit.repository.interface.js';
import type { AdminAuditEventType } from '../../../src/services/admin/admin-audit.events.js';

const correlationId = '00000000-0000-4000-8000-000000000802';

class FakeAdminAuditRepository implements AdminAuditRepository {
  inputs: CreateAdminAuditLogInput[] = [];
  error: Error | null = null;

  async create(input: CreateAdminAuditLogInput): Promise<number> {
    this.inputs.push(input);
    if (this.error)
      throw this.error;

    return 82;
  }
}

describe('administrative audit event catalog', () => {
  it('keeps unique, normalized and explicit event types', () => {
    const eventTypes = Object.values(ADMIN_AUDIT_EVENT_TYPES);

    assert.deepEqual(eventTypes, [
      'catalog.proposals.accept',
      'catalog.proposals.alias',
      'catalog.proposals.associate',
      'catalog.proposals.list',
      'catalog.proposals.reject',
      'comments.delete',
      'comments.hide',
      'comments.restore',
      'comments.unmoderate',
      'comments.update',
      'ingredients.aliases.create',
      'ingredients.aliases.delete',
      'ingredients.aliases.list',
      'ingredients.aliases.update',
      'ingredients.create',
      'ingredients.deprecate',
      'ingredients.list',
      'ingredients.merge',
      'ingredients.restore',
      'ingredients.update',
      'recipes.approve',
      'recipes.archive',
      'recipes.delete',
      'recipes.reject',
      'staff.disable',
      'staff.enable',
      'staff.invitations.create',
      'staff.list',
      'staff.read',
      'staff.roles.grant',
      'staff.roles.revoke',
      'staff.sessions.list',
      'staff.sessions.revoke',
      'tags.create',
      'tags.deprecate',
      'tags.list',
      'tags.merge',
      'tags.restore',
      'tags.update',
      'users.ban',
      'users.unban'
    ]);
    assert.equal(new Set(eventTypes).size, eventTypes.length);
    assert.ok(eventTypes.every((eventType) => /^[a-z]+(?:\.[a-z]+)+$/.test(eventType)));
    assert.equal(ADMIN_AUDIT_FAILURE_POLICY, 'fail-closed');
  });
});

describe('AdminAuditService', () => {
  let repository: FakeAdminAuditRepository;
  let service: AdminAuditService;

  beforeEach(() => {
    repository = new FakeAdminAuditRepository();
    service = new AdminAuditService(repository, () => correlationId);
  });

  it('records one normalized event and centrally redacts sensitive snapshot fields', async () => {
    const beforeValues = {
      status: 'active',
      passwordHash: 'must-not-be-recorded',
      nested: {
        accessToken: 'must-not-be-recorded',
        clientSecret: 'must-not-be-recorded',
        labels: ['community', 'reported']
      }
    } as const;

    const receipt = await service.record({
      actorUserId: 7,
      eventType: ADMIN_AUDIT_EVENT_TYPES.usersBan,
      targetType: ADMIN_AUDIT_TARGET_TYPES.communityUser,
      targetId: ' 42 ',
      reason: '  Repeated abuse confirmed. ',
      beforeValues,
      afterValues: { status: 'banned' },
      ipAddress: ' 2001:db8::7 ',
      userAgent: ' Admin browser '
    });

    assert.deepEqual(receipt, { id: 82, correlationId });
    assert.deepEqual(repository.inputs, [{
      actorUserId: 7,
      action: 'users.ban',
      targetType: 'community_user',
      targetId: '42',
      reason: 'Repeated abuse confirmed.',
      beforeValues: {
        status: 'active',
        passwordHash: '[REDACTED]',
        nested: {
          accessToken: '[REDACTED]',
          clientSecret: '[REDACTED]',
          labels: ['community', 'reported']
        }
      },
      afterValues: { status: 'banned' },
      ipAddress: '2001:db8::7',
      userAgent: 'Admin browser',
      correlationId
    }]);
    assert.equal(beforeValues.passwordHash, 'must-not-be-recorded');
    assert.equal(beforeValues.nested.accessToken, 'must-not-be-recorded');
    assert.equal(beforeValues.nested.clientSecret, 'must-not-be-recorded');
  });

  it('redacts sensitive key variants recursively, including objects nested in arrays', async () => {
    const afterValues = {
      apiKey: 'must-not-be-recorded',
      request: {
        Authorization: 'must-not-be-recorded',
        'private-key': 'must-not-be-recorded'
      },
      attempts: [{ credentialId: 'must-not-be-recorded', outcome: 'denied' }],
      labels: ['security', 'staff']
    } as const;

    await service.record({
      actorUserId: 7,
      eventType: ADMIN_AUDIT_EVENT_TYPES.staffRoleRevoke,
      targetType: ADMIN_AUDIT_TARGET_TYPES.staffUser,
      targetId: 12,
      afterValues
    });

    assert.deepEqual(repository.inputs[0]?.afterValues, {
      apiKey: '[REDACTED]',
      request: {
        Authorization: '[REDACTED]',
        'private-key': '[REDACTED]'
      },
      attempts: [{ credentialId: '[REDACTED]', outcome: 'denied' }],
      labels: ['security', 'staff']
    });
    assert.equal(afterValues.request.Authorization, 'must-not-be-recorded');
    assert.equal(afterValues.attempts[0]?.credentialId, 'must-not-be-recorded');
  });

  it('normalizes a supplied correlation id and persists nullable investigation fields', async () => {
    const receipt = await service.record({
      actorUserId: 7,
      eventType: ADMIN_AUDIT_EVENT_TYPES.recipesApprove,
      targetType: ADMIN_AUDIT_TARGET_TYPES.recipe,
      targetId: 12,
      correlationId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'
    });

    assert.deepEqual(receipt, {
      id: 82,
      correlationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    });
    assert.deepEqual(repository.inputs[0], {
      actorUserId: 7,
      action: 'recipes.approve',
      targetType: 'recipe',
      targetId: '12',
      reason: null,
      beforeValues: null,
      afterValues: null,
      ipAddress: null,
      userAgent: null,
      correlationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    });
  });

  it('fails closed before persistence for invalid events and investigation values', async () => {
    const circularObject: Record<string, unknown> = {};
    circularObject.self = circularObject;
    const circularArray: unknown[] = [];
    circularArray.push(circularArray);
    const invalidSnapshots: unknown[] = [
      new Date(),
      { score: Number.NaN },
      circularObject,
      { values: circularArray }
    ];
    const originalError = logger.error;
    logger.error = () => undefined;

    try {
      for (const invalidInput of [
      { actorUserId: 0 },
      { eventType: 'users.block' as AdminAuditEventType },
      { targetType: ADMIN_AUDIT_TARGET_TYPES.recipe },
      { targetId: ' ' },
        { reason: ' ' },
        ...invalidSnapshots.map((beforeValues) => ({ beforeValues: beforeValues as AdminAuditSnapshot }))
      ]) {
        await assert.rejects(
          () => service.record({
            actorUserId: 7,
            eventType: ADMIN_AUDIT_EVENT_TYPES.usersBan,
            targetType: ADMIN_AUDIT_TARGET_TYPES.communityUser,
            targetId: 42,
            ...invalidInput
          }),
          assertAuditFailure
        );
      }
    } finally {
      logger.error = originalError;
    }

    assert.equal(repository.inputs.length, 0);
  });

  it('fails closed on repository errors and emits only safe operational metadata', async () => {
    repository.error = new Error('database detail that must not cross the service boundary');
    const errors: Array<{ message: string; meta?: unknown }> = [];
    const originalError = logger.error;
    logger.error = (message, meta) => errors.push({ message, meta });

    try {
      await assert.rejects(
        () => service.record({
          actorUserId: 7,
          eventType: ADMIN_AUDIT_EVENT_TYPES.usersBan,
          targetType: ADMIN_AUDIT_TARGET_TYPES.communityUser,
          targetId: 42,
          beforeValues: { password: 'never-log-this-value' }
        }),
        assertAuditFailure
      );
    } finally {
      logger.error = originalError;
    }

    assert.equal(repository.inputs.length, 1);
    assert.deepEqual(errors, [{
      message: '[audit] Mandatory administrative audit record failed',
      meta: {
        actorUserId: 7,
        eventType: 'users.ban',
        targetType: 'community_user',
        targetId: 42,
        correlationId,
        errorName: 'Error',
        policy: 'fail-closed'
      }
    }]);
    assert.doesNotMatch(JSON.stringify(errors), /never-log-this-value|database detail/);
  });
});

function assertAuditFailure(error: unknown): boolean {
  assert.ok(error instanceof HttpError);
  assert.equal(error.statusCode, 500);
  assert.equal(error.code, 'ADMIN_AUDIT_RECORD_FAILED');
  assert.equal(error.message, 'Administrative action could not be audited');

  return true;
}
