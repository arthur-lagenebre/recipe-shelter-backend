import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { StaffSessionService } from '../../../src/services/auth/staff-session.service.js';
import { HttpError } from '../../../src/utils/errors.js';
import { TestAdminAuditRecorder, testAdminAuditContext } from '../../helpers/admin-audit.js';
import { TestSessionRepository } from '../../helpers/auth-session.js';

import type { User } from '../../../src/repositories/users/user.types.js';

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

describe('StaffSessionService', () => {
    let repository: TestSessionRepository;
    let audit: TestAdminAuditRecorder;
    let service: StaffSessionService;
    const users = new Map<number, User>();

    beforeEach(async () => {
        repository = new TestSessionRepository();
        audit = new TestAdminAuditRecorder();
        users.clear();
        users.set(actor.id, actor);
        users.set(target.id, target);
        users.set(community.id, community);
        service = new StaffSessionService(
            repository,
            {
                async findById(id) {
                    return users.get(id) ?? null;
                }
            },
            audit
        );

        await repository.createStaffSession({
            id: '00000000-0000-4000-8000-000000000001',
            userId: actor.id,
            sessionVersion: 1,
            webAuthnCredentialId: 'actor-secret-credential-id',
            mfaVerifiedAt: new Date('2026-07-16T10:00:00.000Z'),
            ipAddress: '192.0.2.1',
            userAgent: 'Actor browser',
            expiresAt: new Date('2099-07-16T18:00:00.000Z')
        });
        await repository.createStaffSession({
            id: '00000000-0000-4000-8000-000000000002',
            userId: target.id,
            sessionVersion: 1,
            webAuthnCredentialId: 'target-secret-credential-id',
            mfaVerifiedAt: new Date('2026-07-16T11:00:00.000Z'),
            ipAddress: '2001:db8::2',
            userAgent: 'Target security key browser',
            expiresAt: new Date('2099-07-16T19:00:00.000Z')
        });
        await repository.createStaffSession({
            id: '00000000-0000-4000-8000-000000000003',
            userId: actor.id,
            sessionVersion: 1,
            webAuthnCredentialId: 'expired-secret-credential-id',
            mfaVerifiedAt: new Date('2025-07-16T10:00:00.000Z'),
            ipAddress: null,
            userAgent: null,
            expiresAt: new Date('2025-07-16T18:00:00.000Z')
        });
    });

    it('lists only the owner sessions and marks the current one without exposing WebAuthn secrets', async () => {
        const sessions = await service.listOwn(actor.id, '00000000-0000-4000-8000-000000000001');

        assert.equal(sessions.length, 1);
        assert.deepEqual(sessions[0], {
            id: '00000000-0000-4000-8000-000000000001',
            mfaMethod: 'webauthn',
            mfaVerifiedAt: new Date('2026-07-16T10:00:00.000Z'),
            ipAddress: '192.0.2.1',
            userAgent: 'Actor browser',
            expiresAt: new Date('2099-07-16T18:00:00.000Z'),
            createdAt: sessions[0]?.createdAt,
            isCurrent: true
        });
        assert.equal('webAuthnCredentialId' in (sessions[0] as unknown as Record<string, unknown>), false);
    });

    it('returns the managed staff identity and never marks another user session as current', async () => {
        const result = await service.listManaged(target.id, actor.id, '00000000-0000-4000-8000-000000000001', testAdminAuditContext);

        assert.deepEqual(result.staff, { id: target.id, username: target.username });
        assert.equal(result.sessions.length, 1);
        assert.equal(result.sessions[0]?.isCurrent, false);
        assert.deepEqual(
            audit.inputs.map((input) => ({
                eventType: input.eventType,
                targetType: input.targetType,
                targetId: input.targetId,
                afterValues: input.afterValues
            })),
            [
                {
                    eventType: 'staff.sessions.list',
                    targetType: 'staff_user',
                    targetId: target.id,
                    afterValues: { activeSessionCount: 1 }
                }
            ]
        );
    });

    it('records self and administrative revocation actors and scopes', async () => {
        await service.revokeOwn(actor.id, '00000000-0000-4000-8000-000000000001', testAdminAuditContext);
        await service.revokeManaged(target.id, '00000000-0000-4000-8000-000000000002', actor.id, 'Compromised browser session.', testAdminAuditContext);

        assert.deepEqual(repository.staffRevocations, [
            {
                id: '00000000-0000-4000-8000-000000000001',
                staffUserId: actor.id,
                revokedByStaffUserId: actor.id,
                revocationType: 'self'
            },
            {
                id: '00000000-0000-4000-8000-000000000002',
                staffUserId: target.id,
                revokedByStaffUserId: actor.id,
                revocationType: 'suspected_compromise'
            }
        ]);
        assert.equal(audit.inputs.length, 2);
        assert.deepEqual(
            audit.inputs.map((input) => ({
                actorUserId: input.actorUserId,
                eventType: input.eventType,
                targetType: input.targetType,
                targetId: input.targetId,
                reason: input.reason,
                afterValues: input.afterValues
            })),
            [
                {
                    actorUserId: actor.id,
                    eventType: 'staff.sessions.revoke',
                    targetType: 'staff_session',
                    targetId: '00000000-0000-4000-8000-000000000001',
                    reason: undefined,
                    afterValues: {
                        staffUserId: actor.id,
                        isRevoked: true,
                        revokedByStaffUserId: actor.id,
                        revocationType: 'self'
                    }
                },
                {
                    actorUserId: actor.id,
                    eventType: 'staff.sessions.revoke',
                    targetType: 'staff_session',
                    targetId: '00000000-0000-4000-8000-000000000002',
                    reason: 'Compromised browser session.',
                    afterValues: {
                        staffUserId: target.id,
                        isRevoked: true,
                        revokedByStaffUserId: actor.id,
                        revocationType: 'suspected_compromise'
                    }
                }
            ]
        );
    });

    it('rejects unknown, community-owned, expired and cross-owner sessions', async () => {
        await assert.rejects(() => service.listManaged(community.id, actor.id, '', testAdminAuditContext), (error) => assertHttpError(error, 'STAFF_USER_NOT_FOUND'));
        await assert.rejects(() => service.listManaged(999, actor.id, '', testAdminAuditContext), (error) => assertHttpError(error, 'STAFF_USER_NOT_FOUND'));
        await assert.rejects(() => service.revokeOwn(actor.id, '00000000-0000-4000-8000-000000000002', testAdminAuditContext), (error) => assertHttpError(error, 'STAFF_SESSION_NOT_FOUND'));
        await assert.rejects(() => service.revokeOwn(actor.id, '00000000-0000-4000-8000-000000000003', testAdminAuditContext), (error) => assertHttpError(error, 'STAFF_SESSION_NOT_FOUND'));
        assert.equal(audit.inputs.length, 0);
    });
});

function assertHttpError(error: unknown, code: string): boolean {
    assert.ok(error instanceof HttpError);
    assert.equal(error.statusCode, 404);
    assert.equal(error.code, code);

    return true;
}
