import type { EmailValidationMailInput, Mailer, PasswordChangedMailInput, PasswordResetMailInput } from './mail.types.js';

export class ConsoleMailer implements Mailer {
    async sendPasswordResetEmail(input: PasswordResetMailInput): Promise<void> {
        console.log('[mail] password reset', input);
    }

    async sendPasswordChangedEmail(input: PasswordChangedMailInput): Promise<void> {
        console.log('[mail] password changed', input);
    }

    async sendEmailValidationEmail(input: EmailValidationMailInput): Promise<void> {
        console.log('[mail] email validation', input);
    }
}
