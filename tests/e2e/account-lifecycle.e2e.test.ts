import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../../src/app.js';
import { EmailValidationService } from '../../src/services/auth/email-validation.service.js';
import { AuthService } from '../../src/services/auth/auth.service.js';
import { PasswordResetService } from '../../src/services/auth/password-reset.service.js';
import { UserService } from '../../src/services/users/users.service.js';
import { env } from '../../src/utils/env.js';
import { startHttpTestServer } from '../helpers/http-test-server.js';
import { TestSessionRepository } from '../helpers/auth-session.js';

import type { EmailValidationCreateInput, EmailValidationRecord, EmailValidationRepository } from '../../src/repositories/auth/email-validation.repository.interface.js';
import type { PasswordResetCreateInput, PasswordResetRecord, PasswordResetRepository } from '../../src/repositories/auth/password-reset.repository.interface.js';
import type { UserRepository } from '../../src/repositories/users/user.repository.interface.js';
import type { CommunityProfile, CreateUserInput, StaffProfile, User, UserWithPassword } from '../../src/repositories/users/user.types.js';
import type { RecipeRepository } from '../../src/repositories/recipes/recipe.repository.interface.js';
import type { EmailValidationMailInput, Mailer, PasswordChangedMailInput, PasswordResetMailInput } from '../../src/services/mail/mail.types.js';
import type { StaffMfaManager } from '../../src/services/auth/staff-mfa.service.js';
import type { HttpTestServer } from '../helpers/http-test-server.js';

class AccountUserRepository implements UserRepository {
    private readonly users = new Map<number, UserWithPassword>();
    private nextId = 1;

    async create(input: CreateUserInput): Promise<User> {
        const createdAt = new Date('2026-07-13T10:00:00.000Z');
        const user: UserWithPassword = {
            id: this.nextId++,
            mail: input.mail,
            username: input.username,
            passwordHash: input.passwordHash,
            accountType: input.accountType,
            status: input.status ?? (input.accountType === 'community' ? 'inactive' : 'invited'),
            emailValidatedAt: null,
            bannedByUserId: null,
            bannedReason: null,
            bannedAt: null,
            createdAt,
            updatedAt: createdAt
        };
        this.users.set(user.id, user);
        return this.withoutPassword(user);
    }

    async findById(id: number): Promise<User | null> {
        const user = this.users.get(id);
        return user ? this.withoutPassword(user) : null;
    }

    async findByEmail(mail: string): Promise<User | null> {
        const user = this.findStoredByEmail(mail);
        return user ? this.withoutPassword(user) : null;
    }

    async findByUsername(username: string): Promise<User | null> {
        const user = [...this.users.values()].find((candidate) => candidate.username === username);
        return user ? this.withoutPassword(user) : null;
    }

    async findCommunityProfileByUserId(userId: number): Promise<CommunityProfile | null> {
        const user = this.users.get(userId);
        if (!user || user.accountType !== 'community')
            return null;
        return {
            userId,
            status: user.status === 'inactive' || user.status === 'active' || user.status === 'banned' ? user.status : 'inactive',
            bannedByUserId: user.bannedByUserId,
            bannedReason: user.bannedReason,
            bannedAt: user.bannedAt,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        };
    }

    async findStaffProfileByUserId(userId: number): Promise<StaffProfile | null> {
        const user = this.users.get(userId);
        if (!user || user.accountType !== 'staff')
            return null;
        return {
            userId,
            status: user.status === 'invited' || user.status === 'active' || user.status === 'locked' || user.status === 'disabled' ? user.status : 'invited',
            mfaEnrolledAt: null,
            disabledByStaffUserId: null,
            disabledReason: null,
            disabledAt: null,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        };
    }

    async findAuthByEmail(mail: string): Promise<UserWithPassword | null> {
        return this.findStoredByEmail(mail) ?? null;
    }

    async findWithPasswordById(id: number): Promise<UserWithPassword | null> {
        return this.users.get(id) ?? null;
    }

    async markEmailValidated(userId: number): Promise<boolean> {
        const user = this.users.get(userId);
        if (!user)
            return false;

        this.users.set(userId, { ...user, status: 'active', emailValidatedAt: new Date() });
        return true;
    }

    async updateEmail(userId: number, mail: string): Promise<void> {
        const user = this.requireUser(userId);
        this.users.set(userId, { ...user, mail });
    }

    async updatePassword(userId: number, passwordHash: string): Promise<void> {
        const user = this.requireUser(userId);
        this.users.set(userId, { ...user, passwordHash });
    }

    async updateUsername(userId: number, username: string): Promise<void> {
        const user = this.requireUser(userId);
        this.users.set(userId, { ...user, username });
    }

    async isEmailTaken(mail: string): Promise<boolean> {
        return this.findStoredByEmail(mail) !== undefined;
    }

    async isUsernameTaken(username: string): Promise<boolean> {
        return [...this.users.values()].some((user) => user.username === username);
    }

    private findStoredByEmail(mail: string): UserWithPassword | undefined {
        return [...this.users.values()].find((user) => user.mail === mail);
    }

    private requireUser(id: number): UserWithPassword {
        const user = this.users.get(id);
        if (!user)
            throw new Error(`User ${id} not found`);
        return user;
    }

    private withoutPassword({ passwordHash, ...user }: UserWithPassword): User {
        void passwordHash;
        return user;
    }
}

class AccountValidationRepository implements EmailValidationRepository {
    private readonly records = new Map<string, EmailValidationRecord>();
    private nextId = 1;

    async create(input: EmailValidationCreateInput): Promise<void> {
        this.records.set(input.tokenHash, {
            Id: this.nextId++,
            UserId: input.userId,
            ExpiresAt: new Date(Date.now() + input.expiresInMinutes * 60_000),
            UsedAt: null
        });
    }

    async invalidateAllForUser(userId: number): Promise<void> {
        for (const [hash, record] of this.records) {
            if (record.UserId === userId)
                this.records.set(hash, { ...record, UsedAt: new Date() });
        }
    }

    async findByTokenHash(tokenHash: string): Promise<EmailValidationRecord | null> {
        return this.records.get(tokenHash) ?? null;
    }

    async markUsed(id: number): Promise<void> {
        for (const [hash, record] of this.records) {
            if (record.Id === id)
                this.records.set(hash, { ...record, UsedAt: new Date() });
        }
    }
}

class AccountResetRepository implements PasswordResetRepository {
    private readonly records = new Map<string, PasswordResetRecord & { expiresAt: Date; used: boolean }>();
    private nextId = 1;

    async create(input: PasswordResetCreateInput): Promise<void> {
        this.records.set(input.tokenHash, {
            Id: this.nextId++,
            UserId: input.userId,
            expiresAt: new Date(Date.now() + input.expiresInMinutes * 60_000),
            used: false
        });
    }

    async invalidateAllForUser(userId: number): Promise<void> {
        for (const record of this.records.values()) {
            if (record.UserId === userId)
                record.used = true;
        }
    }

    async findValidByTokenHash(tokenHash: string): Promise<PasswordResetRecord | null> {
        const record = this.records.get(tokenHash);
        return record && !record.used && record.expiresAt.getTime() > Date.now() ? record : null;
    }

    async markUsed(id: number): Promise<void> {
        for (const record of this.records.values()) {
            if (record.Id === id)
                record.used = true;
        }
    }
}

class AccountMailer implements Mailer {
    validationMail: EmailValidationMailInput | null = null;
    resetMail: PasswordResetMailInput | null = null;
    changedMail: PasswordChangedMailInput | null = null;

    async sendEmailValidationEmail(input: EmailValidationMailInput): Promise<void> {
        this.validationMail = input;
    }

    async sendPasswordResetEmail(input: PasswordResetMailInput): Promise<void> {
        this.resetMail = input;
    }

    async sendPasswordChangedEmail(input: PasswordChangedMailInput): Promise<void> {
        this.changedMail = input;
    }

    async sendContactEmail(): Promise<void> {}
}

async function postJson(baseUrl: string, path: string, body: unknown): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
    });
}

function tokenFromUrl(url: string | undefined): string {
    assert.ok(url);
    const token = new URL(url).searchParams.get('token');
    assert.ok(token);
    return token;
}

describe('account lifecycle E2E', () => {
    let server: HttpTestServer;
    let mailer: AccountMailer;

    before(async () => {
        env.auth.bcryptCost = 4;
        env.auth.rateLimitMaxAttempts = 20;
        const users = new AccountUserRepository();
        const validations = new AccountValidationRepository();
        const resets = new AccountResetRepository();
        mailer = new AccountMailer();
        const emailValidationService = new EmailValidationService(users, validations, mailer, 'https://front.example');
        const sessions = new TestSessionRepository();
        const passwordResetService = new PasswordResetService(users, resets, sessions, mailer, 'https://front.example');

        server = await startHttpTestServer(createApp({
            authService: new AuthService(users, emailValidationService, sessions, {} as StaffMfaManager),
            authSessionRepository: sessions,
            authUserRepository: users,
            emailValidationService,
            passwordResetService,
            usersService: new UserService(users, {
                async findPublishedByAuthorId() { return []; }
            } as unknown as RecipeRepository, sessions)
        }));
    });

    after(async () => server.close());

    it('registers, validates, resets the password and signs in again', async () => {
        const register = await postJson(server.baseUrl, '/api/v1/auth/register', {
            mail: ' ALICE@Example.com ',
            username: 'alice',
            password: 'InitialPass42!',
            accountType: 'staff'
        });
        assert.equal(register.status, 201);
        const registeredUser = (await register.json() as { user: User }).user;
        assert.equal(registeredUser.status, 'inactive');
        assert.equal(registeredUser.accountType, 'community');
        assert.equal(mailer.validationMail?.to, 'alice@example.com');

        const inactiveLogin = await postJson(server.baseUrl, '/api/v1/auth/login', {
            mail: 'alice@example.com',
            password: 'InitialPass42!'
        });
        assert.equal(inactiveLogin.status, 401);
        assert.equal((await inactiveLogin.json() as { error: { code: string } }).error.code, 'EMAIL_NOT_VALIDATED');

        const validate = await postJson(server.baseUrl, '/api/v1/auth/validate-email', {
            token: tokenFromUrl(mailer.validationMail?.validationUrl)
        });
        assert.equal(validate.status, 200);
        assert.equal((await validate.json() as { user: User }).user.status, 'active');

        const login = await postJson(server.baseUrl, '/api/v1/auth/login', {
            mail: 'alice@example.com',
            password: 'InitialPass42!'
        });
        assert.equal(login.status, 200);
        assert.match(login.headers.get('set-cookie') ?? '', /HttpOnly/i);
        const preResetSessionCookie = (login.headers.get('set-cookie') ?? '').split(';', 1)[0];
        assert.ok(preResetSessionCookie);

        const forgot = await postJson(server.baseUrl, '/api/v1/auth/forgot-password', {
            mail: 'alice@example.com'
        });
        assert.equal(forgot.status, 200);
        assert.equal(mailer.resetMail?.to, 'alice@example.com');

        const reset = await postJson(server.baseUrl, '/api/v1/auth/reset-password', {
            token: tokenFromUrl(mailer.resetMail?.resetUrl),
            password: 'UpdatedPass42!'
        });
        assert.equal(reset.status, 200);
        assert.deepEqual(mailer.changedMail, { to: 'alice@example.com', username: 'alice' });

        const resetRevokedSession = await fetch(`${server.baseUrl}/api/v1/users/me`, { headers: { cookie: preResetSessionCookie } });
        assert.equal(resetRevokedSession.status, 401);
        assert.equal((await resetRevokedSession.json() as { error: { code: string } }).error.code, 'AUTH_BAD_TOKEN');

        const oldPassword = await postJson(server.baseUrl, '/api/v1/auth/login', {
            mail: 'alice@example.com',
            password: 'InitialPass42!'
        });
        assert.equal(oldPassword.status, 401);

        const newPassword = await postJson(server.baseUrl, '/api/v1/auth/login', {
            mail: 'alice@example.com',
            password: 'UpdatedPass42!'
        });
        assert.equal(newPassword.status, 200);

        const sessionCookie = (newPassword.headers.get('set-cookie') ?? '').split(';', 1)[0];
        assert.ok(sessionCookie);

        const otherLogin = await postJson(server.baseUrl, '/api/v1/auth/login', { mail: 'alice@example.com', password: 'UpdatedPass42!' });
        assert.equal(otherLogin.status, 200);
        const otherSessionCookie = (otherLogin.headers.get('set-cookie') ?? '').split(';', 1)[0];
        assert.ok(otherSessionCookie);

        const updateUsername = await fetch(`${server.baseUrl}/api/v1/users/me/username`, {
            method: 'PATCH',
            headers: { cookie: sessionCookie, 'content-type': 'application/json' },
            body: JSON.stringify({ currentPassword: 'UpdatedPass42!', newUsername: 'alice-renamed' })
        });
        assert.equal(updateUsername.status, 200);
        assert.equal((await updateUsername.json() as { user: User }).user.username, 'alice-renamed');

        const updateEmail = await fetch(`${server.baseUrl}/api/v1/users/me/email`, {
            method: 'PATCH',
            headers: { cookie: sessionCookie, 'content-type': 'application/json' },
            body: JSON.stringify({ currentPassword: 'UpdatedPass42!', newEmail: 'alice.new@example.com' })
        });
        assert.equal(updateEmail.status, 200);
        assert.equal((await updateEmail.json() as { user: User }).user.mail, 'alice.new@example.com');

        const updatePassword = await fetch(`${server.baseUrl}/api/v1/users/me/password`, {
            method: 'PATCH',
            headers: { cookie: sessionCookie, 'content-type': 'application/json' },
            body: JSON.stringify({ currentPassword: 'UpdatedPass42!', newPassword: 'FinalPass42!' })
        });
        assert.equal(updatePassword.status, 200);

        const preservedSession = await fetch(`${server.baseUrl}/api/v1/users/me`, { headers: { cookie: sessionCookie } });
        assert.equal(preservedSession.status, 200);

        const revokedOtherSession = await fetch(`${server.baseUrl}/api/v1/users/me`, { headers: { cookie: otherSessionCookie } });
        assert.equal(revokedOtherSession.status, 401);
        assert.equal((await revokedOtherSession.json() as { error: { code: string } }).error.code, 'AUTH_BAD_TOKEN');

        const finalLogin = await postJson(server.baseUrl, '/api/v1/auth/login', {
            mail: 'alice.new@example.com',
            password: 'FinalPass42!'
        });
        assert.equal(finalLogin.status, 200);
        assert.equal((await finalLogin.json() as { user: User }).user.username, 'alice-renamed');
    });
});
