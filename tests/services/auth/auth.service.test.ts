import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { AuthService } from '../../../src/services/auth/auth.service.js';
import { env } from '../../../src/utils/env.js';
import { HttpError } from '../../../src/utils/errors.js';

import type { EmailValidationService } from '../../../src/services/auth/email-validation.service.js';
import type { UserRepository } from '../../../src/repositories/users/user.repository.interface.js';
import type { CreateUserInput, User, UserWithPassword } from '../../../src/repositories/users/user.types.js';

const baseUser: User = {
    id: 2,
    mail: 'user@example.com',
    username: 'testuser',
    roleId: 2,
    status: 'active',
    emailValidatedAt: new Date('2026-05-09T10:00:00.000Z'),
    bannedByUserId: null,
    bannedReason: null,
    bannedAt: null,
    createdAt: new Date('2026-05-09T10:00:00.000Z'),
    updatedAt: new Date('2026-05-09T10:00:00.000Z')
};

class FakeUserRepository implements Partial<UserRepository> {
    createdInput: CreateUserInput | null = null;
    emailTaken = false;
    usernameTaken = false;
    roleId: number | null = 2;
    authUser: UserWithPassword | null = null;

    async isEmailTaken(): Promise<boolean> {
        return this.emailTaken;
    }

    async isUsernameTaken(): Promise<boolean> {
        return this.usernameTaken;
    }

    async getRoleIdByName(): Promise<number | null> {
        return this.roleId;
    }

    async create(input: CreateUserInput): Promise<User> {
        this.createdInput = input;

        return { ...baseUser, mail: input.mail, username: input.username, roleId: input.roleId, status: input.status ?? 'active' };
    }

    async findAuthByEmail(): Promise<UserWithPassword | null> {
        return this.authUser;
    }
}

class FakeEmailValidationService {
    sentUser: User | null = null;

    async sendValidationEmailForUser(user: User): Promise<void> {
        this.sentUser = user;
    }
}

function assertHttpError(error: unknown, code: string, status: number): boolean {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);

    return true;
}

describe('AuthService', () => {
    let users: FakeUserRepository;
    let emailValidation: FakeEmailValidationService;
    let service: AuthService;

    beforeEach(() => {
        env.auth.bcryptCost = 4;
        users = new FakeUserRepository();
        emailValidation = new FakeEmailValidationService();
        service = new AuthService(users as unknown as UserRepository, emailValidation as unknown as EmailValidationService);
    });

    it('registers inactive users and sends a validation email', async () => {
        const result = await service.register({ mail: ' USER@Example.COM ', username: ' testuser ', password: 'Recipe42?' });

        assert.equal(users.createdInput?.mail, 'user@example.com');
        assert.equal(users.createdInput?.username, 'testuser');
        assert.equal(users.createdInput?.roleId, 2);
        assert.equal(users.createdInput?.status, 'inactive');
        assert.equal(await bcrypt.compare('Recipe42?', users.createdInput?.passwordHash ?? ''), true);
        assert.deepEqual(emailValidation.sentUser, result.user);
        assert.match(result.message, /validate your email/);
    });

    it('rejects invalid registration inputs and conflicts', async () => {
        await assert.rejects(() => service.register({ mail: '', username: 'testuser', password: 'Recipe42?' }), (error) => assertHttpError(error, 'AUTH_MISSING_FIELDS', 400));
        await assert.rejects(() => service.register({ mail: 'user@example.com', username: 'testuser', password: 'short' }), (error) => assertHttpError(error, 'AUTH_WEAK_PASSWORD', 400));

        users.emailTaken = true;
        await assert.rejects(() => service.register({ mail: 'user@example.com', username: 'testuser', password: 'Recipe42?' }), (error) => assertHttpError(error, 'AUTH_EMAIL_TAKEN', 409));
        users.emailTaken = false;
        users.usernameTaken = true;
        await assert.rejects(() => service.register({ mail: 'user@example.com', username: 'testuser', password: 'Recipe42?' }), (error) => assertHttpError(error, 'AUTH_USERNAME_TAKEN', 409));
        users.usernameTaken = false;
        users.roleId = null;
        await assert.rejects(() => service.register({ mail: 'user@example.com', username: 'testuser', password: 'Recipe42?' }), (error) => assertHttpError(error, 'AUTH_ROLE_NOT_FOUND', 400));
    });

    it('logs in active users and returns a signed token', async () => {
        users.authUser = { ...baseUser, passwordHash: await bcrypt.hash('Recipe42?', 4) };

        const result = await service.login({ mail: ' USER@Example.COM ', password: 'Recipe42?' });
        const payload = jwt.verify(result.token, env.auth.jwtSecret) as jwt.JwtPayload;

        assert.equal(result.user.mail, 'user@example.com');
        assert.equal('passwordHash' in result.user, false);
        assert.equal(payload.sub, 2);
        assert.equal(payload.username, 'testuser');
        assert.equal(payload.roleId, 2);
        assert.equal(payload.status, 'active');
    });

    it('rejects invalid login states', async () => {
        await assert.rejects(() => service.login({ mail: '', password: 'Recipe42?' }), (error) => assertHttpError(error, 'AUTH_MISSING_FIELDS', 400));
        await assert.rejects(() => service.login({ mail: 'user@example.com', password: 'Recipe42?' }), (error) => assertHttpError(error, 'AUTH_INVALID_CREDENTIALS', 401));

        users.authUser = { ...baseUser, passwordHash: await bcrypt.hash('Recipe42?', 4) };
        await assert.rejects(() => service.login({ mail: 'user@example.com', password: 'wrong' }), (error) => assertHttpError(error, 'AUTH_INVALID_CREDENTIALS', 401));

        users.authUser = { ...baseUser, status: 'inactive', passwordHash: await bcrypt.hash('Recipe42?', 4) };
        await assert.rejects(() => service.login({ mail: 'user@example.com', password: 'Recipe42?' }), (error) => assertHttpError(error, 'EMAIL_NOT_VALIDATED', 401));

        users.authUser = { ...baseUser, status: 'banned', passwordHash: await bcrypt.hash('Recipe42?', 4) };
        await assert.rejects(() => service.login({ mail: 'user@example.com', password: 'Recipe42?' }), (error) => assertHttpError(error, 'USER_BANNED', 401));
    });
});
