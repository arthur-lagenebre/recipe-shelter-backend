import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAuthController } from '../../../src/api/auth/auth.controller.js';
import { env } from '../../../src/utils/env.js';
import { adminSessionCookieName, appSessionCookieName } from '../../../src/utils/session-cookie.js';

import type { User } from '../../../src/repositories/users/user.types.js';
import type { AuthService } from '../../../src/services/auth/auth.service.js';
import type { EmailValidationService } from '../../../src/services/auth/email-validation.service.js';
import type { PasswordResetService } from '../../../src/services/auth/password-reset.service.js';
import type { CookieOptions, RequestHandler } from 'express';

type TestCookie = {
    name: string;
    value?: string;
    options: CookieOptions;
};

type TestResponse = {
    statusCode: number;
    body: unknown;
    cookies: TestCookie[];
    clearedCookies: TestCookie[];
    status(code: number): TestResponse;
    json(payload: unknown): TestResponse;
    cookie(name: string, value: string, options: CookieOptions): TestResponse;
    clearCookie(name: string, options: CookieOptions): TestResponse;
};

const user: User = {
    id: 2,
    mail: 'user@example.com',
    username: 'testuser',
    accountType: 'community',
    status: 'active',
    emailValidatedAt: new Date('2026-05-09T10:00:00.000Z'),
    bannedByUserId: null,
    bannedReason: null,
    bannedAt: null,
    createdAt: new Date('2026-05-09T10:00:00.000Z'),
    updatedAt: new Date('2026-05-09T10:00:00.000Z')
};

function createResponse(): TestResponse {
    return {
        statusCode: 0,
        body: null,
        cookies: [],
        clearedCookies: [],
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(payload: unknown) {
            this.body = payload;
            return this;
        },
        cookie(name: string, value: string, options: CookieOptions) {
            this.cookies.push({ name, value, options });
            return this;
        },
        clearCookie(name: string, options: CookieOptions) {
            this.clearedCookies.push({ name, options });
            return this;
        }
    };
}

async function runHandler(handler: RequestHandler, req: unknown, res: TestResponse): Promise<void> {
    let nextError: unknown;

    handler(req as never, res as never, (error?: unknown) => {
        nextError = error;
    });

    await new Promise((resolve) => setImmediate(resolve));

    if (nextError)
        throw nextError;
}

function createController(authService: unknown) {
    return createAuthController(
        authService as AuthService,
        {} as PasswordResetService,
        {} as EmailValidationService
    );
}

describe('auth.controller', () => {
    it('sets the session cookie on login without returning the JWT', async () => {
        let receivedInput: unknown;
        const controller = createController({
            async loginCommunity(input: { mail: string; password: string }) {
                receivedInput = input;

                return { user, token: 'signed-token' };
            }
        });
        const res = createResponse();

        await runHandler(controller.login, { body: { mail: ' USER@Example.COM ', password: 'secret' } }, res);

        assert.deepEqual(receivedInput, { mail: 'user@example.com', password: 'secret' });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { user });
        assert.equal('token' in (res.body as Record<string, unknown>), false);
        assert.equal(res.cookies.length, 1);
        assert.equal(res.cookies[0].name, appSessionCookieName);
        assert.equal(res.cookies[0].value, 'signed-token');
        assert.equal(res.cookies[0].options.httpOnly, true);
        assert.equal(res.cookies[0].options.path, env.auth.app.sessionCookiePath);
        assert.equal(res.cookies[0].options.sameSite, env.auth.cookie.sameSite);
        assert.equal(res.cookies[0].options.secure, env.auth.cookie.secure);
        assert.equal(res.cookies[0].options.maxAge, env.auth.app.sessionCookieMaxAgeMs);
    });

    it('sets only the shorter admin cookie after password and MFA verification', async () => {
        const staffUser = { ...user, accountType: 'staff', status: 'active' } as const;
        const controller = createController({
            async loginStaff() {
                return { user: staffUser, token: 'staff-token' };
            }
        });
        const res = createResponse();

        await runHandler(controller.staffLogin, {
            body: { mail: 'staff@example.com', password: 'secret', mfaCode: '123456' }
        }, res);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { user: staffUser });
        assert.deepEqual(res.cookies.map(({ name }) => name), [adminSessionCookieName]);
        assert.equal(env.auth.admin.sessionCookiePath, '/api/v1');
        assert.equal(res.cookies[0].options.path, env.auth.admin.sessionCookiePath);
        assert.equal(res.cookies[0].options.maxAge, env.auth.admin.sessionCookieMaxAgeMs);
        assert.ok(env.auth.admin.sessionCookieMaxAgeMs < env.auth.app.sessionCookieMaxAgeMs);
    });

    it('clears the same session cookie on logout', async () => {
        const logoutCalls: unknown[] = [];
        const controller = createController({
            async logout(...args: unknown[]) {
                logoutCalls.push(args);
            }
        });
        const res = createResponse();

        await runHandler(controller.logout, { cookies: { [appSessionCookieName]: 'app-token' } }, res);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { ok: true });
        assert.deepEqual(logoutCalls, [['app-token', 'app']]);
        assert.equal(res.clearedCookies.length, 1);
        assert.equal(res.clearedCookies[0].name, appSessionCookieName);
        assert.equal(res.clearedCookies[0].options.httpOnly, true);
        assert.equal(res.clearedCookies[0].options.path, env.auth.app.sessionCookiePath);
        assert.equal(res.clearedCookies[0].options.sameSite, env.auth.cookie.sameSite);
        assert.equal(res.clearedCookies[0].options.secure, env.auth.cookie.secure);
        assert.equal(res.clearedCookies[0].options.domain, env.auth.cookie.domain);
    });

    it('clears only the admin cookie on staff logout', async () => {
        const controller = createController({ async logout() { } });
        const res = createResponse();

        await runHandler(controller.staffLogout, { cookies: { [adminSessionCookieName]: 'admin-token' } }, res);

        assert.deepEqual(res.clearedCookies.map(({ name }) => name), [adminSessionCookieName]);
        assert.equal(res.clearedCookies[0].options.path, env.auth.admin.sessionCookiePath);
    });
});
