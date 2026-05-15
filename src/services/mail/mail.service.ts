import nodemailer from 'nodemailer';

import { internalError, type HttpError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

import type { ContactMailer, ContactMailInput } from './mail.types.js';
import type { Transporter } from 'nodemailer';

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  contactRecipientEmail: string;
};

export class SmtpMailService implements ContactMailer {
  private readonly transporter: Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password }
    });
  }

  async sendContactEmail(input: ContactMailInput): Promise<void> {
    this.ensureContactMailConfiguration();

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: this.config.contactRecipientEmail,
        replyTo: input.email,
        subject: `[Contact] ${input.subject}`,
        text: this.formatContactMessage(input)
      });
    } catch (error) {
      logger.error('[mail] Contact email delivery failed', error);

      throw this.toContactMailError();
    }
  }

  private ensureContactMailConfiguration(): void {
    const missingFields = [['SMTP_HOST', this.config.host], ['SMTP_FROM', this.config.from], ['CONTACT_RECIPIENT_EMAIL', this.config.contactRecipientEmail]]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (this.config.port <= 0)
      missingFields.push('SMTP_PORT');

    if (missingFields.length > 0) {
      logger.error('[mail] SMTP contact configuration is incomplete', { missingFields });

      throw this.toContactMailError();
    }
  }

  private formatContactMessage(input: ContactMailInput): string {
    return [
      `Name: ${input.name}`,
      `Email: ${input.email}`,
      `Subject: ${input.subject}`,
      `Sent at: ${input.sentAt.toISOString()}`,
      'Message:',
      input.message
    ].join('\n');
  }

  private toContactMailError(): HttpError {
    return internalError('Unable to send contact message', 'CONTACT_SEND_FAILED');
  }
}
