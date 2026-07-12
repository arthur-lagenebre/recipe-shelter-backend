import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { ContactService } from '../../../src/services/contact/contact.service.js';

import type { ContactMessageInput } from '../../../src/services/contact/contact.types.js';
import type { ContactMailInput, Mailer } from '../../../src/services/mail/mail.types.js';

const contactMessage: ContactMessageInput = {
    name: 'Alice Martin',
    email: 'alice@example.com',
    subject: 'Recipe question',
    message: 'Could you clarify the baking time?'
};

function createMailer(sendContactEmail: (input: ContactMailInput) => Promise<void>): Mailer {
    return {
        sendContactEmail,
        async sendEmailValidationEmail() {},
        async sendPasswordChangedEmail() {},
        async sendPasswordResetEmail() {}
    };
}

describe('ContactService', () => {
    it('adds the send date and delegates the complete message to the mailer', async () => {
        const beforeSend = Date.now();
        const sentMessages: ContactMailInput[] = [];
        const mailer = createMailer(async (input) => {
            sentMessages.push(input);
        });

        await new ContactService(mailer).sendContactMessage(contactMessage);

        const afterSend = Date.now();
        assert.equal(sentMessages.length, 1);
        const sentMessage = sentMessages[0];
        assert.deepEqual(
            {
                name: sentMessage.name,
                email: sentMessage.email,
                subject: sentMessage.subject,
                message: sentMessage.message
            },
            contactMessage
        );
        assert.ok(sentMessage.sentAt instanceof Date);
        assert.ok(sentMessage.sentAt.getTime() >= beforeSend);
        assert.ok(sentMessage.sentAt.getTime() <= afterSend);
    });

    it('propagates mail delivery failures', async () => {
        const deliveryError = new Error('SMTP unavailable');
        const sendContactEmail = mock.fn(async () => {
            throw deliveryError;
        });
        const service = new ContactService(createMailer(sendContactEmail));

        await assert.rejects(() => service.sendContactMessage(contactMessage), deliveryError);
        assert.equal(sendContactEmail.mock.callCount(), 1);
    });
});
