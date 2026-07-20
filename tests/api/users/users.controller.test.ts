import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createUsersController } from '../../../src/api/users/users.controller.js';
import { signSessionToken } from '../../../src/services/auth/session-token.js';
import { appSessionCookieName } from '../../../src/utils/session-cookie.js';

import type { User } from '../../../src/repositories/users/user.types.js';
import type { UserService } from '../../../src/services/users/users.service.js';
import type { RequestHandler } from 'express';

type TestResponse = {
    statusCode: number;
    body: unknown;
    status(code: number): TestResponse;
    json(payload: unknown): TestResponse;
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
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(payload: unknown) {
            this.body = payload;
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

    if (nextError) throw nextError;
}

describe('users.controller', () => {
    it('passes the current app session id to the password update service', async () => {
        let receivedSessionId: string | null | undefined;
        const controller = createUsersController({
            async updatePassword(_userId: number, _currentPassword: string, _newPassword: string, currentSessionId: string | null) {
                receivedSessionId = currentSessionId;
            }
        } as UserService);
        const res = createResponse();

        await runHandler(
            controller.updatePassword,
            {
                auth: { userId: 2, accountType: 'community', status: 'active' },
                body: { currentPassword: 'CurrentPass42!', newPassword: 'NewPass42!' },
                cookies: {
                    [appSessionCookieName]: signSessionToken(user, 'app', 'current-session-id')
                }
            },
            res
        );

        assert.equal(receivedSessionId, 'current-session-id');
        assert.equal(res.statusCode, 200);
    });

    it('does not block a password update when the app session cookie is absent or invalid', async () => {
        const receivedSessionIds: Array<string | null> = [];
        const controller = createUsersController({
            async updatePassword(_userId: number, _currentPassword: string, _newPassword: string, currentSessionId: string | null) {
                receivedSessionIds.push(currentSessionId);
            }
        } as UserService);
        const request = {
            auth: { userId: 2, accountType: 'community', status: 'active' },
            body: { currentPassword: 'CurrentPass42!', newPassword: 'NewPass42!' }
        };

        await runHandler(controller.updatePassword, { ...request, cookies: {} }, createResponse());
        await runHandler(
            controller.updatePassword,
            {
                ...request,
                cookies: { [appSessionCookieName]: 'invalid-token' }
            },
            createResponse()
        );

        assert.deepEqual(receivedSessionIds, [null, null]);
    });
});
