import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { StaffInvitationService } from '../../../src/services/admin/admin.staff-invitation.service.js';
import { HttpError } from '../../../src/utils/errors.js';
import { TestAdminAuditRecorder, testAdminAuditContext } from '../../helpers/admin-audit.js';

import type { CreateStaffInvitationInput, CreateStaffInvitationResult, StaffInvitationRepository } from '../../../src/repositories/admin/admin.staff-invitation.repository.interface.js';
import type { StaffInvitationMailInput, StaffInvitationMailer } from '../../../src/services/mail/mail.types.js';
import type { PoolConnection } from 'mysql2/promise';

const expiresAt = new Date('2026-07-18T10:00:00.000Z');
const createdAt = new Date('2026-07-17T10:00:00.000Z');
const invitation = {
    id: 7,
    staffUserId: 42,
    email: 'staff.member@example.com',
    displayName: 'Staff Member',
    status: 'invited' as const,
    roles: [
        { id: 1, code: 'RecipeModerator', name: 'Modérateur de recettes' },
        { id: 2, code: 'CommentModerator', name: 'Modérateur de commentaires' }
    ],
    expiresAt,
    createdAt
};

class FakeStaffInvitationRepository implements StaffInvitationRepository {
    result: CreateStaffInvitationResult = { status: 'created', invitation };
    input: CreateStaffInvitationInput | null = null;
    db: PoolConnection | undefined;

    async create(input: CreateStaffInvitationInput, db?: PoolConnection): Promise<CreateStaffInvitationResult> {
        this.input = input;
        this.db = db;
        return this.result;
    }
}

class FakeStaffInvitationMailer implements StaffInvitationMailer {
    messages: StaffInvitationMailInput[] = [];
    error: Error | null = null;

    async sendStaffInvitationEmail(input: StaffInvitationMailInput): Promise<void> {
        if (this.error)
            throw this.error;

        this.messages.push(input);
    }
}

describe('StaffInvitationService', () => {
    let repository: FakeStaffInvitationRepository;
    let mailer: FakeStaffInvitationMailer;
    let audit: TestAdminAuditRecorder;
    let service: StaffInvitationService;
    let generatedTokenCount: number;

    beforeEach(() => {
        repository = new FakeStaffInvitationRepository();
        mailer = new FakeStaffInvitationMailer();
        audit = new TestAdminAuditRecorder();
        generatedTokenCount = 0;
        service = new StaffInvitationService(repository, mailer, audit, 'https://front.example/', {
            invitationTtlMinutes: 1440,
            generateToken: () => {
                generatedTokenCount += 1;
                return 'raw token/with reserved characters';
            },
            hashToken: (token) => `hash:${token}`
        });
    });

    it('atomically creates, audits and emails one expiring invitation without leaking the raw token', async () => {
        const result = await service.create(
            {
                email: ' Staff.Member@Example.COM ',
                displayName: ' Staff Member ',
                roles: [' RecipeModerator ', 'CommentModerator']
            },
            9,
            testAdminAuditContext
        );

        assert.equal(result, invitation);
        assert.deepEqual(repository.input, {
            email: 'staff.member@example.com',
            displayName: 'Staff Member',
            roleCodes: ['RecipeModerator', 'CommentModerator'],
            tokenHash: 'hash:raw token/with reserved characters',
            invitationTtlMinutes: 1440,
            createdByStaffUserId: 9
        });
        assert.ok(repository.db);
        assert.deepEqual(mailer.messages, [
            {
                to: 'staff.member@example.com',
                displayName: 'Staff Member',
                invitationUrl: 'https://front.example/auth/staff-invitation?token=raw%20token%2Fwith%20reserved%20characters',
                expiresInMinutes: 1440
            }
        ]);
        assert.deepEqual(audit.inputs, [
            {
                actorUserId: 9,
                eventType: 'staff.invitations.create',
                targetType: 'staff_invitation',
                targetId: 7,
                afterValues: {
                    staffUserId: 42,
                    displayName: 'Staff Member',
                    status: 'invited',
                    roles: ['RecipeModerator', 'CommentModerator'],
                    expiresAt: '2026-07-18T10:00:00.000Z'
                },
                ...testAdminAuditContext
            }
        ]);
        assert.equal(JSON.stringify(audit.inputs).includes('staff.member@example.com'), false);
        assert.equal(JSON.stringify(audit.inputs).includes('raw token'), false);
        assert.equal(generatedTokenCount, 1);
    });

    it('returns distinct conflicts for an existing invitation, email and display name', async () => {
        const cases: Array<{ result: CreateStaffInvitationResult; code: string }> = [
            { result: { status: 'invitation_exists', invitationId: 7 }, code: 'STAFF_INVITATION_ALREADY_EXISTS' },
            { result: { status: 'email_taken' }, code: 'STAFF_EMAIL_ALREADY_EXISTS' },
            { result: { status: 'display_name_taken' }, code: 'STAFF_DISPLAY_NAME_ALREADY_EXISTS' }
        ];

        for (const testCase of cases) {
            repository.result = testCase.result;
            await assert.rejects(
                () =>
                    service.create(
                        { email: 'staff@example.com', displayName: 'Staff Member', roles: ['UserAdmin'] },
                        9,
                        testAdminAuditContext
                    ),
                (error) => assertHttpError(error, testCase.code, 409)
            );
            assert.equal(audit.inputs.length, 0);
            assert.equal(mailer.messages.length, 0);
        }
    });

    it('rejects unknown roles and invalid input before sending mail', async () => {
        repository.result = { status: 'roles_missing', roleCodes: ['UnknownRole'] };
        await assert.rejects(
            () =>
                service.create(
                    { email: 'staff@example.com', displayName: 'Staff Member', roles: ['UnknownRole'] },
                    9,
                    testAdminAuditContext
                ),
            (error) => assertHttpError(error, 'STAFF_INVITATION_ROLES_INVALID', 400)
        );

        const generatedBeforeInvalidInput = generatedTokenCount;
        await assert.rejects(
            () => service.create({ email: 'invalid', displayName: 'Staff Member', roles: ['UserAdmin'] }, 9, testAdminAuditContext),
            (error) => assertHttpError(error, 'STAFF_INVITATION_EMAIL_INVALID', 400)
        );
        assert.equal(generatedTokenCount, generatedBeforeInvalidInput);
        assert.equal(mailer.messages.length, 0);
    });

    it('fails closed before mail delivery when mandatory audit fails', async () => {
        audit.error = new Error('audit unavailable');

        await assert.rejects(
            () =>
                service.create({ email: 'staff@example.com', displayName: 'Staff Member', roles: ['UserAdmin'] }, 9, testAdminAuditContext),
            /audit unavailable/
        );
        assert.equal(mailer.messages.length, 0);
    });

    it('propagates mail delivery failures to the surrounding transaction', async () => {
        mailer.error = new Error('SMTP unavailable');

        await assert.rejects(
            () =>
                service.create({ email: 'staff@example.com', displayName: 'Staff Member', roles: ['UserAdmin'] }, 9, testAdminAuditContext),
            /SMTP unavailable/
        );
        assert.equal(audit.inputs.length, 1);
    });

    it('requires a positive whole invitation TTL', () => {
        for (const invitationTtlMinutes of [0, -1, 1.5]) {
            assert.throws(
                () => new StaffInvitationService(repository, mailer, audit, 'https://front.example', { invitationTtlMinutes }),
                /Staff invitation TTL must be a positive integer/
            );
        }
    });
});

function assertHttpError(error: unknown, code: string, status: number): boolean {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
    return true;
}
