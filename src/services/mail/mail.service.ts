import nodemailer from 'nodemailer';

import { internalError, type HttpError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

import type { ContactMailInput, EmailValidationMailInput, Mailer, PasswordChangedMailInput, PasswordResetMailInput } from './mail.types.js';
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

export class SmtpMailService implements Mailer {
  private readonly transporter: Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password }
    });
  }

  async sendPasswordResetEmail(input: PasswordResetMailInput): Promise<void> {
    await this.sendApplicationMail({
      to: input.to,
      subject: 'Reinitialisation de votre mot de passe',
      text: this.formatPasswordResetMessage(input.username, input.resetUrl)
    });
  }

  async sendPasswordChangedEmail(input: PasswordChangedMailInput): Promise<void> {
    await this.sendApplicationMail({
      to: input.to,
      subject: 'Votre mot de passe a ete modifie',
      text: this.formatPasswordChangedMessage(input.username)
    });
  }

  async sendEmailValidationEmail(input: EmailValidationMailInput): Promise<void> {
    await this.sendApplicationMail({
      to: input.to,
      subject: 'Validation de votre compte Recipe Shelter',
      text: this.formatValidationMessage(input.username, input.validationUrl)
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

  private async sendApplicationMail(input: { to: string; subject: string; text: string }): Promise<void> {
    this.ensureApplicationMailConfiguration();

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: input.to,
        subject: input.subject,
        text: input.text
      });
    } catch (error) {
      logger.error('[mail] Application email delivery failed', error);

      throw internalError('Unable to send email', 'MAIL_SEND_FAILED');
    }
  }

  private ensureApplicationMailConfiguration(): void {
    const missingFields = this.getMissingBaseConfigurationFields();

    if (missingFields.length > 0) {
      logger.error('[mail] SMTP configuration is incomplete', { missingFields });

      throw internalError('Unable to send email', 'MAIL_SEND_FAILED');
    }
  }

  private ensureContactMailConfiguration(): void {
    const missingFields = [
      ...this.getMissingBaseConfigurationFields(),
      ...[['CONTACT_RECIPIENT_EMAIL', this.config.contactRecipientEmail]]
        .filter(([, value]) => !value)
        .map(([name]) => name)
    ];

    if (missingFields.length > 0) {
      logger.error('[mail] SMTP contact configuration is incomplete', { missingFields });

      throw this.toContactMailError();
    }
  }

  private getMissingBaseConfigurationFields(): string[] {
    const missingFields = [['SMTP_HOST', this.config.host], ['SMTP_FROM', this.config.from]]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (this.config.port <= 0)
      missingFields.push('SMTP_PORT');

    return missingFields;
  }

  private formatPasswordResetMessage(username: string, resetUrl: string): string {
    return [
      `Bonjour ${username},`,
      ``,
      `Vous avez demandé la réinitialisation de votre mot de passe.`,
      `Lien de réinitialisation : ${resetUrl}`,
      ``,
      `Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.`
    ].join('\n');
  }

  private formatPasswordChangedMessage(username: string): string {
    return [
      `Bonjour ${username},`,
      ``,
      `Votre mot de passe Recipe Shelter vient d'être modifié.`,
      ``,
      `Si vous n'êtes pas à l'origine de cette action, contactez rapidement le support.`
    ].join('\n');
  }

  private formatValidationMessage(username: string, validationUrl: string): string {
    return [
      `Bonjour ${username},`,
      ``,
      `Merci de créer un compte Recipe Shelter.`,
      `Lien de validation : ${validationUrl}`,
      ``,
      `Ce lien expirera dans 24 heures.`
    ].join('\n');
  }

  private formatContactMessage(input: ContactMailInput): string {
    return [
      `Nom     : ${input.name}`,
      `Email   : ${input.email}`,
      `Sujet   : ${input.subject}`,
      `Envoyé  : ${input.sentAt.toLocaleString()}`,
      'Message :',
      input.message
    ].join('\n');
  }

  private toContactMailError(): HttpError {
    return internalError('Unable to send contact message', 'CONTACT_SEND_FAILED');
  }
}
