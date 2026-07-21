import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createContactController } from '../../../src/api/contact/contact.controller.js';

import type { ContactService } from '../../../src/services/contact/contact.service.js';
import type { RequestHandler } from 'express';

type TestResponse = {
    statusCode: number;
    body: unknown;
    status(code: number): TestResponse;
    json(payload: unknown): TestResponse;
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

    if (nextError)
        throw nextError;
}

function renderedAtMsAgo(ms: number): string {
    return new Date(Date.now() - ms).toISOString();
}

describe('contact.controller', () => {
    it('returns a success response without sending an email when the submission looks like a bot', async () => {
        let sendCalled = false;
        const controller = createContactController({
            async sendContactMessage() {
                sendCalled = true;
            }
        } as unknown as ContactService);
        const res = createResponse();

        await runHandler(
            controller.sendContactMessage,
            {
                body: {
                    name: 'John Doe',
                    email: 'john@example.com',
                    subject: 'Question',
                    message: 'Bonjour, je voudrais en savoir plus.',
                    formRenderedAt: renderedAtMsAgo(10_000),
                    company: 'Acme Corp'
                }
            },
            res
        );

        assert.equal(sendCalled, false);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { message: 'Contact message sent' });
    });

    it('sends the email as usual for a legitimate submission', async () => {
        let receivedInput: unknown;
        const controller = createContactController({
            async sendContactMessage(input: unknown) {
                receivedInput = input;
            }
        } as unknown as ContactService);
        const res = createResponse();

        await runHandler(
            controller.sendContactMessage,
            {
                body: {
                    name: 'John Doe',
                    email: 'john@example.com',
                    subject: 'Question',
                    message: 'Bonjour, je voudrais en savoir plus.',
                    formRenderedAt: renderedAtMsAgo(10_000)
                }
            },
            res
        );

        assert.deepEqual(receivedInput, {
            name: 'John Doe',
            email: 'john@example.com',
            subject: 'Question',
            message: 'Bonjour, je voudrais en savoir plus.'
        });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { message: 'Contact message sent' });
    });
});
