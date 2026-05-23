import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAuthController } from '../../../src/api/auth/auth.controller.js';
import { env } from '../../../src/utils/env.js';
import { sessionCookieName } from '../../../src/utils/session-cookie.js';

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
    roleId: 2,
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
            async login(input: { mail: string; password: string }) {
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
        assert.equal(res.cookies[0].name, sessionCookieName);
        assert.equal(res.cookies[0].value, 'signed-token');
        assert.equal(res.cookies[0].options.httpOnly, true);
        assert.equal(res.cookies[0].options.path, '/');
        assert.equal(res.cookies[0].options.sameSite, env.auth.sessionCookieSameSite);
        assert.equal(res.cookies[0].options.secure, env.auth.sessionCookieSecure);
        assert.equal(res.cookies[0].options.maxAge, env.auth.sessionCookieMaxAgeMs);
    });

    it('clears the same session cookie on logout', async () => {
        const controller = createController({});
        const res = createResponse();

        await runHandler(controller.logout, {}, res);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { ok: true });
        assert.equal(res.clearedCookies.length, 1);
        assert.equal(res.clearedCookies[0].name, sessionCookieName);
        assert.equal(res.clearedCookies[0].options.httpOnly, true);
        assert.equal(res.clearedCookies[0].options.path, '/');
        assert.equal(res.clearedCookies[0].options.sameSite, env.auth.sessionCookieSameSite);
        assert.equal(res.clearedCookies[0].options.secure, env.auth.sessionCookieSecure);
        assert.equal(res.clearedCookies[0].options.domain, env.auth.sessionCookieDomain);
    });
});
