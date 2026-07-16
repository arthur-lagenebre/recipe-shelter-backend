import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { SuperAdminBootstrapService } from '../../../src/services/bootstrap/super-admin-bootstrap.service.js';
import { HttpError } from '../../../src/utils/errors.js';

import type {
    ConsumeSuperAdminInvitationResult,
    CreateFirstSuperAdminInput,
    CreateFirstSuperAdminResult,
    SuperAdminBootstrapRepository
} from '../../../src/repositories/bootstrap/super-admin-bootstrap.repository.interface.js';
import type { SuperAdminBootstrapInvitationMailInput } from '../../../src/services/mail/mail.types.js';

class FakeSuperAdminBootstrapRepository implements SuperAdminBootstrapRepository {
    createResult: CreateFirstSuperAdminResult = { status: 'created', userId: 42 };
    consumeResult: ConsumeSuperAdminInvitationResult = { status: 'consumed', userId: 42, requiresMfa: true };
    createInput: CreateFirstSuperAdminInput | null = null;
    consumedTokenHash: string | null = null;
    cancelledInvitation: { userId: number; tokenHash: string } | null = null;

    async createFirst(input: CreateFirstSuperAdminInput): Promise<CreateFirstSuperAdminResult> {
        this.createInput = input;
        return this.createResult;
    }

    async consumeInvitation(tokenHash: string): Promise<ConsumeSuperAdminInvitationResult> {
        this.consumedTokenHash = tokenHash;
        return this.consumeResult;
    }

    async cancelPendingInvitation(userId: number, tokenHash: string): Promise<boolean> {
        this.cancelledInvitation = { userId, tokenHash };
        return true;
    }
}

class FakeBootstrapMailer {
    input: SuperAdminBootstrapInvitationMailInput | null = null;
    error: Error | null = null;

    async sendSuperAdminBootstrapInvitationEmail(input: SuperAdminBootstrapInvitationMailInput): Promise<void> {
        this.input = input;
        if (this.error)
            throw this.error;
    }
}

function assertHttpError(error: unknown, code: string, status: number): boolean {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
    return true;
}

describe('SuperAdminBootstrapService', () => {
    const rawToken = 'raw-bootstrap-invitation-token';
    const tokenHash = 'a'.repeat(64);
    let repository: FakeSuperAdminBootstrapRepository;
    let mailer: FakeBootstrapMailer;
    let hashedTokenInput: string | null;
    let service: SuperAdminBootstrapService;

    beforeEach(() => {
        repository = new FakeSuperAdminBootstrapRepository();
        mailer = new FakeBootstrapMailer();
        hashedTokenInput = null;
        service = new SuperAdminBootstrapService(repository, mailer, 'https://front.example/', {
            invitationTtlMinutes: 30,
            generateToken: () => rawToken,
            hashToken: (token) => {
                hashedTokenInput = token;
                return tokenHash;
            }
        });
    });

    it('stores only the token hash and sends the raw one only in the invitation email', async () => {
        const result = await service.bootstrap({
            mail: ' FIRST.ADMIN@Example.COM ',
            username: ' FirstAdmin '
        });

        assert.deepEqual(result, { userId: 42 });
        assert.equal(hashedTokenInput, rawToken);
        assert.deepEqual(repository.createInput, {
            mail: 'first.admin@example.com',
            username: 'FirstAdmin',
            invitationTokenHash: tokenHash,
            invitationTtlMinutes: 30
        });
        assert.equal(JSON.stringify(repository.createInput).includes(rawToken), false);
        assert.deepEqual(mailer.input, {
            to: 'first.admin@example.com',
            username: 'FirstAdmin',
            invitationUrl: `https://front.example/auth/staff-invitation?token=${rawToken}`,
            expiresInMinutes: 30
        });
        assert.equal('token' in result, false);
    });

    it('consumes a normalized token through its hash and keeps MFA mandatory', async () => {
        assert.deepEqual(await service.consumeInvitation(`  ${rawToken}  `), {
            userId: 42,
            requiresMfa: true
        });
        assert.equal(repository.consumedTokenHash, tokenHash);
        assert.notEqual(repository.consumedTokenHash, rawToken);
    });

    it('cancels the pending account when invitation delivery fails so bootstrap can be retried', async () => {
        const deliveryError = new Error('mail delivery failed');
        mailer.error = deliveryError;

        await assert.rejects(
            () => service.bootstrap({ mail: 'first.admin@example.com', username: 'FirstAdmin' }),
            deliveryError
        );
        assert.deepEqual(repository.cancelledInvitation, { userId: 42, tokenHash });
    });

    it('rejects missing, expired or already used invitation tokens with stable errors', async () => {
        await assert.rejects(
            () => service.consumeInvitation('  '),
            (error) => assertHttpError(error, 'BOOTSTRAP_SUPER_ADMIN_INVITATION_TOKEN_REQUIRED', 400)
        );

        repository.consumeResult = { status: 'invalid' };
        await assert.rejects(
            () => service.consumeInvitation(rawToken),
            (error) => assertHttpError(error, 'BOOTSTRAP_SUPER_ADMIN_INVITATION_INVALID', 400)
        );
    });

    it('rejects bootstrap when an active SuperAdmin already exists', async () => {
        repository.createResult = { status: 'super_admin_exists', active: true };

        await assert.rejects(
            () => service.bootstrap({ mail: 'other@example.com', username: 'other-admin' }),
            (error) => assertHttpError(error, 'SUPER_ADMIN_ALREADY_EXISTS', 409)
        );
        assert.equal(mailer.input, null);
    });

    it('does not bootstrap a replacement after the first SuperAdmin was invited or disabled', async () => {
        repository.createResult = { status: 'super_admin_exists', active: false };

        await assert.rejects(
            () => service.bootstrap({ mail: 'replacement@example.com', username: 'replacement-admin' }),
            (error) => assertHttpError(error, 'BOOTSTRAP_SUPER_ADMIN_ALREADY_COMPLETED', 409)
        );
        assert.equal(mailer.input, null);
    });

    it('maps identity conflicts and a missing seeded role to business errors', async () => {
        const input = { mail: 'first@example.com', username: 'first-admin' };

        repository.createResult = { status: 'email_taken' };
        await assert.rejects(
            () => service.bootstrap(input),
            (error) => assertHttpError(error, 'BOOTSTRAP_SUPER_ADMIN_EMAIL_TAKEN', 409)
        );

        repository.createResult = { status: 'username_taken' };
        await assert.rejects(
            () => service.bootstrap(input),
            (error) => assertHttpError(error, 'BOOTSTRAP_SUPER_ADMIN_USERNAME_TAKEN', 409)
        );

        repository.createResult = { status: 'role_missing' };
        await assert.rejects(
            () => service.bootstrap(input),
            (error) => assertHttpError(error, 'BOOTSTRAP_SUPER_ADMIN_ROLE_MISSING', 500)
        );
    });

    it('validates identity before generating or persisting an invitation', async () => {
        const invalidInputs = [
            { input: { mail: '', username: 'first-admin' }, code: 'BOOTSTRAP_SUPER_ADMIN_MISSING_EMAIL' },
            { input: { mail: 'invalid', username: 'first-admin' }, code: 'BOOTSTRAP_SUPER_ADMIN_INVALID_EMAIL' },
            { input: { mail: 'first@example.com', username: '' }, code: 'BOOTSTRAP_SUPER_ADMIN_MISSING_USERNAME' },
            { input: { mail: 'first@example.com', username: 'ab' }, code: 'BOOTSTRAP_SUPER_ADMIN_WEAK_USERNAME' },
            { input: { mail: 'first@example.com', username: 'a'.repeat(65) }, code: 'BOOTSTRAP_SUPER_ADMIN_USERNAME_TOO_LONG' }
        ];

        for (const { input, code } of invalidInputs)
            await assert.rejects(() => service.bootstrap(input), (error) => assertHttpError(error, code, 400));

        assert.equal(hashedTokenInput, null);
        assert.equal(repository.createInput, null);
        assert.equal(mailer.input, null);
    });

    it('requires a positive whole invitation TTL', () => {
        for (const invitationTtlMinutes of [0, -1, 1.5]) {
            assert.throws(
                () => new SuperAdminBootstrapService(repository, mailer, 'https://front.example', { invitationTtlMinutes }),
                /positive integer/
            );
        }
    });
});
