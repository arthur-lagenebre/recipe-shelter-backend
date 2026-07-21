import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import { SmtpMailService } from '../../../src/services/mail/mail.service.js';
import { HttpError } from '../../../src/utils/errors.js';
import { logger } from '../../../src/utils/logger.js';

import type { SmtpConfig } from '../../../src/services/mail/mail.service.js';
import type { SendMailOptions, SentMessageInfo, Transporter } from 'nodemailer';

const config: SmtpConfig = {
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    user: 'mailer',
    password: 'secret',
    from: 'no-reply@example.com',
    contactRecipientEmail: 'contact@example.com'
};

class FakeTransporter {
    messages: SendMailOptions[] = [];
    deliveryError: Error | null = null;

    async sendMail(message: SendMailOptions): Promise<SentMessageInfo> {
        if (this.deliveryError)
            throw this.deliveryError;

        this.messages.push(message);
        return { messageId: 'test-message' } as SentMessageInfo;
    }
}

function createService(overrides: Partial<SmtpConfig> = {}) {
    const transporter = new FakeTransporter();
    const service = new SmtpMailService({ ...config, ...overrides }, transporter as unknown as Pick<Transporter, 'sendMail'>);

    return { service, transporter };
}

function assertMailError(error: unknown, code: string): boolean {
    assert.ok(error instanceof HttpError);
    assert.equal(error.statusCode, 500);
    assert.equal(error.code, code);
    return true;
}

describe('SmtpMailService', () => {
    beforeEach(() => {
        mock.method(logger, 'error', () => undefined);
    });

    it('formats and sends all application emails', async () => {
        const { service, transporter } = createService();

        await service.sendPasswordResetEmail({
            to: 'alice@example.com',
            username: 'alice',
            resetUrl: 'https://front.example/reset?token=abc'
        });
        await service.sendPasswordChangedEmail({ to: 'alice@example.com', username: 'alice' });
        await service.sendEmailValidationEmail({
            to: 'alice@example.com',
            username: 'alice',
            validationUrl: 'https://front.example/validate?token=def'
        });
        await service.sendSuperAdminBootstrapInvitationEmail({
            to: 'alice@example.com',
            username: 'alice',
            invitationUrl: 'https://front.example/auth/staff-invitation?token=ghi',
            expiresInMinutes: 30
        });
        await service.sendStaffInvitationEmail({
            to: 'alice@example.com',
            displayName: 'Alice Martin',
            invitationUrl: 'https://front.example/auth/staff-invitation?token=jkl',
            expiresInMinutes: 1440
        });

        assert.equal(transporter.messages.length, 5);
        assert.deepEqual(
            transporter.messages.map(({ from, to }) => ({ from, to })),
            Array.from({ length: 5 }, () => ({ from: config.from, to: 'alice@example.com' }))
        );
        assert.match(String(transporter.messages[0]?.text), /alice/);
        assert.match(String(transporter.messages[0]?.text), /token=abc/);
        assert.match(String(transporter.messages[1]?.text), /alice/);
        assert.match(String(transporter.messages[2]?.text), /token=def/);
        assert.match(String(transporter.messages[3]?.text), /token=ghi/);
        assert.match(String(transporter.messages[3]?.text), /30 minutes/);
        assert.match(String(transporter.messages[3]?.text), /multifacteur/);
        assert.match(String(transporter.messages[4]?.text), /Alice Martin/);
        assert.match(String(transporter.messages[4]?.text), /token=jkl/);
        assert.match(String(transporter.messages[4]?.text), /1440 minutes/);
        assert.match(String(transporter.messages[4]?.text), /multifacteur/);
    });

    it('sends contact messages to the configured recipient with reply-to metadata', async () => {
        const { service, transporter } = createService();

        await service.sendContactEmail({
            name: 'Alice Martin',
            email: 'alice@example.com',
            subject: 'Recipe question',
            message: 'How long should it bake?',
            sentAt: new Date('2026-07-13T10:00:00.000Z')
        });

        assert.equal(transporter.messages.length, 1);
        assert.equal(transporter.messages[0]?.to, config.contactRecipientEmail);
        assert.equal(transporter.messages[0]?.replyTo, 'alice@example.com');
        assert.equal(transporter.messages[0]?.subject, '[Contact] Recipe question');
        assert.match(String(transporter.messages[0]?.text), /Alice Martin/);
        assert.match(String(transporter.messages[0]?.text), /How long should it bake/);
    });

    it('rejects incomplete application and contact configurations before delivery', async () => {
        const application = createService({ host: '', port: 0, from: '' });
        await assert.rejects(
            () => application.service.sendPasswordChangedEmail({ to: 'alice@example.com', username: 'alice' }),
            (error) => assertMailError(error, 'MAIL_SEND_FAILED')
        );
        assert.equal(application.transporter.messages.length, 0);

        const contact = createService({ contactRecipientEmail: '' });
        await assert.rejects(
            () =>
                contact.service.sendContactEmail({
                    name: 'Alice',
                    email: 'alice@example.com',
                    subject: 'Question',
                    message: 'Hello',
                    sentAt: new Date()
                }),
            (error) => assertMailError(error, 'CONTACT_SEND_FAILED')
        );
        assert.equal(contact.transporter.messages.length, 0);
    });

    it('maps transport failures to stable public errors', async () => {
        const application = createService();
        application.transporter.deliveryError = new Error('SMTP unavailable');
        await assert.rejects(
            () =>
                application.service.sendEmailValidationEmail({
                    to: 'alice@example.com',
                    username: 'alice',
                    validationUrl: 'https://front.example/validate'
                }),
            (error) => assertMailError(error, 'MAIL_SEND_FAILED')
        );

        const contact = createService();
        contact.transporter.deliveryError = new Error('SMTP unavailable');
        await assert.rejects(
            () =>
                contact.service.sendContactEmail({
                    name: 'Alice',
                    email: 'alice@example.com',
                    subject: 'Question',
                    message: 'Hello',
                    sentAt: new Date()
                }),
            (error) => assertMailError(error, 'CONTACT_SEND_FAILED')
        );
    });
});
