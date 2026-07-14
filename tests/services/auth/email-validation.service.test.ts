import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { EmailValidationService } from '../../../src/services/auth/email-validation.service.js';
import { HttpError } from '../../../src/utils/errors.js';
import { hashResetToken } from '../../../src/utils/security/password-reset-token.js';

import type { EmailValidationRepository, EmailValidationRecord } from '../../../src/repositories/auth/email-validation.repository.interface.js';
import type { User } from '../../../src/repositories/users/user.types.js';
import type { EmailValidationMailInput, Mailer } from '../../../src/services/mail/mail.types.js';

const baseUser: User = {
    id: 2,
    mail: 'user@example.com',
    username: 'testuser',
    roleId: 2,
    accountType: 'community',
    status: 'inactive',
    emailValidatedAt: null,
    bannedByUserId: null,
    bannedReason: null,
    bannedAt: null,
    createdAt: new Date('2026-05-09T10:00:00.000Z'),
    updatedAt: new Date('2026-05-09T10:00:00.000Z')
};

class FakeUsers {
    userByEmail: User | null = baseUser;
    userById: User | null = baseUser;
    markedValidatedUserId: number | null = null;

    async findByEmail(): Promise<User | null> {
        return this.userByEmail;
    }

    async findById(): Promise<User | null> {
        return this.userById;
    }

    async markEmailValidated(userId: number): Promise<boolean> {
        this.markedValidatedUserId = userId;

        return true;
    }
}

class FakeValidations implements EmailValidationRepository {
    invalidatedUserId: number | null = null;
    createdInput: { userId: number; tokenHash: string; expiresInMinutes: number } | null = null;
    validation: EmailValidationRecord | null = null;
    tokenHashInput: string | null = null;
    markedUsedId: number | null = null;

    async create(input: { userId: number; tokenHash: string; expiresInMinutes: number }): Promise<void> {
        this.createdInput = input;
    }

    async invalidateAllForUser(userId: number): Promise<void> {
        this.invalidatedUserId = userId;
    }

    async findByTokenHash(tokenHash: string): Promise<EmailValidationRecord | null> {
        this.tokenHashInput = tokenHash;

        return this.validation;
    }

    async markUsed(id: number): Promise<void> {
        this.markedUsedId = id;
    }
}

class FakeMailer implements Partial<Mailer> {
    validationEmail: EmailValidationMailInput | null = null;

    async sendEmailValidationEmail(input: EmailValidationMailInput): Promise<void> {
        this.validationEmail = input;
    }
}

function assertHttpError(error: unknown, code: string, status: number): boolean {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);

    return true;
}

describe('EmailValidationService', () => {
    let users: FakeUsers;
    let validations: FakeValidations;
    let mailer: FakeMailer;
    let service: EmailValidationService;

    beforeEach(() => {
        users = new FakeUsers();
        validations = new FakeValidations();
        mailer = new FakeMailer();
        service = new EmailValidationService(users, validations, mailer as unknown as Mailer, 'https://front.example');
    });

    it('creates and sends validation emails', async () => {
        await service.sendValidationEmailForUser(baseUser);

        assert.equal(validations.createdInput?.userId, 2);
        assert.equal(validations.createdInput?.expiresInMinutes, 24 * 60);
        assert.match(validations.createdInput?.tokenHash ?? '', /^[a-f0-9]{64}$/);
        assert.equal(mailer.validationEmail?.to, 'user@example.com');

        const validationUrl = new URL(mailer.validationEmail?.validationUrl ?? '');
        const token = validationUrl.searchParams.get('token') ?? '';
        assert.equal(hashResetToken(token), validations.createdInput?.tokenHash);
    });

    it('resends validation emails only for inactive accounts', async () => {
        await service.resendValidationEmail(' USER@Example.COM ');

        assert.equal(validations.invalidatedUserId, 2);
        assert.equal(mailer.validationEmail?.to, 'user@example.com');

        users.userByEmail = null;
        await service.resendValidationEmail('missing@example.com');

        users.userByEmail = { ...baseUser, status: 'active' };
        await assert.rejects(() => service.resendValidationEmail('user@example.com'), (error) => assertHttpError(error, 'AUTH_VALIDATION_RESEND_NOT_ALLOWED', 400));
        await assert.rejects(() => service.resendValidationEmail(' '), (error) => assertHttpError(error, 'AUTH_VALIDATION_RESEND_MISSING_EMAIL', 400));
    });

    it('validates a token and returns the refreshed user', async () => {
        validations.validation = {
            Id: 4,
            UserId: 2,
            ExpiresAt: new Date(Date.now() + 60_000),
            UsedAt: null
        };
        users.userById = baseUser;

        const result = await service.validateEmail(' token ');

        assert.equal(validations.tokenHashInput, hashResetToken('token'));
        assert.equal(users.markedValidatedUserId, 2);
        assert.equal(validations.markedUsedId, 4);
        assert.deepEqual(result, baseUser);
    });

    it('rejects invalid validation tokens and blocked users', async () => {
        await assert.rejects(() => service.validateEmail(' '), (error) => assertHttpError(error, 'AUTH_EMAIL_VALIDATION_MISSING_TOKEN', 400));
        await assert.rejects(() => service.validateEmail('token'), (error) => assertHttpError(error, 'AUTH_EMAIL_VALIDATION_INVALID_TOKEN', 400));

        validations.validation = { Id: 4, UserId: 2, ExpiresAt: new Date(Date.now() + 60_000), UsedAt: new Date() };
        await assert.rejects(() => service.validateEmail('token'), (error) => assertHttpError(error, 'AUTH_EMAIL_VALIDATION_TOKEN_USED', 400));

        validations.validation = { ...validations.validation, UsedAt: null, ExpiresAt: new Date(Date.now() - 60_000) };
        await assert.rejects(() => service.validateEmail('token'), (error) => assertHttpError(error, 'AUTH_EMAIL_VALIDATION_TOKEN_EXPIRED', 400));

        validations.validation = { ...validations.validation, ExpiresAt: new Date(Date.now() + 60_000) };
        users.userById = { ...baseUser, status: 'banned' };
        await assert.rejects(() => service.validateEmail('token'), (error) => assertHttpError(error, 'USER_BANNED', 403));
    });
});
