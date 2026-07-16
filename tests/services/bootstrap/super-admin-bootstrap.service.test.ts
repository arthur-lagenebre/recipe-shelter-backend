import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { SuperAdminBootstrapService } from '../../../src/services/bootstrap/super-admin-bootstrap.service.js';
import { HttpError } from '../../../src/utils/errors.js';

import type {
    CreateFirstSuperAdminInput,
    CreateFirstSuperAdminResult,
    SuperAdminBootstrapRepository
} from '../../../src/repositories/bootstrap/super-admin-bootstrap.repository.interface.js';

class FakeSuperAdminBootstrapRepository implements SuperAdminBootstrapRepository {
    result: CreateFirstSuperAdminResult = { status: 'created', userId: 42 };
    input: CreateFirstSuperAdminInput | null = null;

    async createFirst(input: CreateFirstSuperAdminInput): Promise<CreateFirstSuperAdminResult> {
        this.input = input;
        return this.result;
    }
}

function assertHttpError(error: unknown, code: string, status: number): boolean {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
    return true;
}

describe('SuperAdminBootstrapService', () => {
    let repository: FakeSuperAdminBootstrapRepository;
    let hashedPasswordInput: string | null;
    let service: SuperAdminBootstrapService;

    beforeEach(() => {
        repository = new FakeSuperAdminBootstrapRepository();
        hashedPasswordInput = null;
        service = new SuperAdminBootstrapService(repository, async (password) => {
            hashedPasswordInput = password;
            return 'password-hash';
        });
    });

    it('normalizes the identity and sends only the password hash to persistence', async () => {
        const result = await service.bootstrap({
            mail: ' FIRST.ADMIN@Example.COM ',
            username: ' FirstAdmin ',
            password: 'StrongPass42!'
        });

        assert.deepEqual(result, { userId: 42 });
        assert.equal(hashedPasswordInput, 'StrongPass42!');
        assert.deepEqual(repository.input, {
            mail: 'first.admin@example.com',
            username: 'FirstAdmin',
            passwordHash: 'password-hash'
        });
        assert.equal('password' in (repository.input as unknown as Record<string, unknown>), false);
    });

    it('rejects bootstrap when an active SuperAdmin already exists', async () => {
        repository.result = { status: 'super_admin_exists', active: true };

        await assert.rejects(
            () => service.bootstrap({
                mail: 'other@example.com',
                username: 'other-admin',
                password: 'StrongPass42!'
            }),
            (error) => assertHttpError(error, 'BOOTSTRAP_SUPER_ADMIN_ACTIVE_EXISTS', 409)
        );
    });

    it('does not bootstrap a replacement after the first SuperAdmin was disabled', async () => {
        repository.result = { status: 'super_admin_exists', active: false };

        await assert.rejects(
            () => service.bootstrap({
                mail: 'replacement@example.com',
                username: 'replacement-admin',
                password: 'StrongPass42!'
            }),
            (error) => assertHttpError(error, 'BOOTSTRAP_SUPER_ADMIN_ALREADY_COMPLETED', 409)
        );
    });

    it('maps identity conflicts and a missing seeded role to business errors', async () => {
        const input = { mail: 'first@example.com', username: 'first-admin', password: 'StrongPass42!' };

        repository.result = { status: 'email_taken' };
        await assert.rejects(
            () => service.bootstrap(input),
            (error) => assertHttpError(error, 'BOOTSTRAP_SUPER_ADMIN_EMAIL_TAKEN', 409)
        );

        repository.result = { status: 'username_taken' };
        await assert.rejects(
            () => service.bootstrap(input),
            (error) => assertHttpError(error, 'BOOTSTRAP_SUPER_ADMIN_USERNAME_TAKEN', 409)
        );

        repository.result = { status: 'role_missing' };
        await assert.rejects(
            () => service.bootstrap(input),
            (error) => assertHttpError(error, 'BOOTSTRAP_SUPER_ADMIN_ROLE_MISSING', 500)
        );

    });

    it('validates identity and password before hashing or persistence', async () => {
        const invalidInputs = [
            {
                input: { mail: '', username: 'first-admin', password: 'StrongPass42!' },
                code: 'BOOTSTRAP_SUPER_ADMIN_MISSING_EMAIL'
            },
            {
                input: { mail: 'invalid', username: 'first-admin', password: 'StrongPass42!' },
                code: 'BOOTSTRAP_SUPER_ADMIN_INVALID_EMAIL'
            },
            {
                input: { mail: 'first@example.com', username: 'ab', password: 'StrongPass42!' },
                code: 'BOOTSTRAP_SUPER_ADMIN_WEAK_USERNAME'
            },
            {
                input: { mail: 'first@example.com', username: 'a'.repeat(65), password: 'StrongPass42!' },
                code: 'BOOTSTRAP_SUPER_ADMIN_USERNAME_TOO_LONG'
            },
            {
                input: { mail: 'first@example.com', username: 'first-admin', password: 'short' },
                code: 'BOOTSTRAP_SUPER_ADMIN_WEAK_PASSWORD'
            }
        ];

        for (const { input, code } of invalidInputs)
            await assert.rejects(() => service.bootstrap(input), (error) => assertHttpError(error, code, 400));

        assert.equal(hashedPasswordInput, null);
        assert.equal(repository.input, null);
    });
});
