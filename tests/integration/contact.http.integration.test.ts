import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import express from 'express';

import { createContactController } from '../../src/api/contact/contact.controller.js';
import { createContactRouter } from '../../src/api/contact/contact.routes.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { ContactService } from '../../src/services/contact/contact.service.js';
import { startHttpTestServer } from '../helpers/http-test-server.js';

import type { ContactMailInput, Mailer } from '../../src/services/mail/mail.types.js';

class CapturingMailer implements Mailer {
    messages: ContactMailInput[] = [];

    async sendContactEmail(input: ContactMailInput): Promise<void> {
        this.messages.push(input);
    }

    async sendEmailValidationEmail(): Promise<void> {}
    async sendPasswordChangedEmail(): Promise<void> {}
    async sendPasswordResetEmail(): Promise<void> {}
}

async function createContactTestApp() {
    const mailer = new CapturingMailer();
    const app = express();
    app.use(express.json());
    app.use('/api/v1/contact', createContactRouter(createContactController(new ContactService(mailer))));
    app.use(errorHandler);

    return { mailer, server: await startHttpTestServer(app) };
}

function sendContact(baseUrl: string, body: unknown): Promise<Response> {
    return fetch(`${baseUrl}/api/v1/contact`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
    });
}

const validMessage = {
    name: 'Alice Martin',
    email: 'alice@example.com',
    subject: 'Recipe question',
    message: 'Could you clarify the cooking time for this recipe?',
    formRenderedAt: new Date(Date.now() - 10_000).toISOString()
};

describe('contact HTTP integration', () => {
    it('validates and sends a contact message through the HTTP stack', async (context) => {
        const { mailer, server } = await createContactTestApp();
        context.after(() => server.close());

        const response = await sendContact(server.baseUrl, validMessage);

        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { message: 'Contact message sent' });
        assert.equal(mailer.messages.length, 1);
        const expectedMessage: Partial<typeof validMessage> = { ...validMessage };
        delete expectedMessage.formRenderedAt;
        assert.deepEqual({ ...mailer.messages[0], sentAt: undefined }, { ...expectedMessage, sentAt: undefined });
        assert.ok(mailer.messages[0]?.sentAt instanceof Date);
    });

    it('returns validation errors and limits repeated submissions', async (context) => {
        const { mailer, server } = await createContactTestApp();
        context.after(() => server.close());

        const invalid = await sendContact(server.baseUrl, { ...validMessage, email: 'invalid' });
        assert.equal(invalid.status, 400);
        assert.equal(((await invalid.json()) as { error: { code: string } }).error.code, 'CONTACT_INVALID_EMAIL');

        for (let attempt = 0; attempt < 4; attempt++)
            assert.equal((await sendContact(server.baseUrl, validMessage)).status, 200);

        const limited = await sendContact(server.baseUrl, validMessage);
        assert.equal(limited.status, 429);
        assert.equal(((await limited.json()) as { error: { code: string } }).error.code, 'RATE_LIMIT');
        assert.equal(mailer.messages.length, 4);
    });
});
