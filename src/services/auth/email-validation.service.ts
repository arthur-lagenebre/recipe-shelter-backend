import { badRequest, forbidden } from '../../utils/errors.js';
import { generateResetToken, hashResetToken } from '../../utils/security/password-reset-token.js';
import { normalizeEmail } from '../../utils/string.js';

import type { EmailValidationRepository } from '../../repositories/auth/email-validation.repository.interface.js';
import type { User } from '../../repositories/users/user.types.js';
import type { Mailer } from '../mail/mail.types.js';

type UserRepository = {
    findByEmail(mail: string): Promise<User | null>;
    findById(id: number): Promise<User | null>;
    markEmailValidated(userId: number): Promise<boolean>;
};

const EMAIL_VALIDATION_TTL_MINUTES = 24 * 60;

export class EmailValidationService {
    constructor(
        private readonly users: UserRepository,
        private readonly validations: EmailValidationRepository,
        private readonly mailer: Mailer,
        private readonly appBaseUrl: string
    ) {}

    async sendValidationEmailForUser(user: User): Promise<void> {
        if (user.accountType !== 'community')
            throw badRequest('Email validation is only available to community accounts', 'AUTH_EMAIL_VALIDATION_NOT_ALLOWED');

        await this.createAndSendValidation(user);
    }

    async resendValidationEmail(mail: string): Promise<void> {
        const normalizedMail = normalizeEmail(mail);

        if (!normalizedMail) throw badRequest('Email is required', 'AUTH_VALIDATION_RESEND_MISSING_EMAIL');

        const user = await this.users.findByEmail(normalizedMail);

        if (!user) return;

        if (user.accountType !== 'community' || user.status !== 'inactive')
            throw badRequest('Validation email can only be resent for inactive accounts', 'AUTH_VALIDATION_RESEND_NOT_ALLOWED');

        await this.validations.invalidateAllForUser(user.id);
        await this.createAndSendValidation(user);
    }

    async validateEmail(token: string): Promise<User> {
        const cleanToken = token.trim();

        if (!cleanToken) throw badRequest('Token is required', 'AUTH_EMAIL_VALIDATION_MISSING_TOKEN');

        const tokenHash = hashResetToken(cleanToken);
        const validation = await this.validations.findByTokenHash(tokenHash);

        if (!validation) throw badRequest('Invalid validation token', 'AUTH_EMAIL_VALIDATION_INVALID_TOKEN');

        if (validation.UsedAt) throw badRequest('Validation token already used', 'AUTH_EMAIL_VALIDATION_TOKEN_USED');

        if (new Date(validation.ExpiresAt).getTime() <= Date.now())
            throw badRequest('Validation token expired', 'AUTH_EMAIL_VALIDATION_TOKEN_EXPIRED');

        const user = await this.users.findById(validation.UserId);

        if (!user) throw badRequest('Invalid validation token', 'AUTH_EMAIL_VALIDATION_INVALID_TOKEN');

        if (user.accountType !== 'community')
            throw forbidden('Email validation is only available to community accounts', 'AUTH_EMAIL_VALIDATION_NOT_ALLOWED');

        if (user.status === 'banned') throw forbidden('User is banned', 'USER_BANNED');

        const activated = await this.users.markEmailValidated(user.id);
        if (!activated) throw badRequest('Email validation is not available for this account', 'AUTH_EMAIL_VALIDATION_NOT_ALLOWED');

        await this.validations.markUsed(validation.Id);

        const updatedUser = await this.users.findById(user.id);

        if (!updatedUser) throw badRequest('Invalid validation token', 'AUTH_EMAIL_VALIDATION_INVALID_TOKEN');

        return updatedUser;
    }

    private async createAndSendValidation(user: User): Promise<void> {
        const token = generateResetToken();
        const tokenHash = hashResetToken(token);

        await this.validations.create({ userId: user.id, tokenHash, expiresInMinutes: EMAIL_VALIDATION_TTL_MINUTES });

        const validationUrl = `${this.appBaseUrl}/auth/validate-email?token=${encodeURIComponent(token)}`;

        await this.mailer.sendEmailValidationEmail({ to: user.mail, username: user.username, validationUrl });
    }
}
