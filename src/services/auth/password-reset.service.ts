import bcrypt from 'bcrypt';

import { validatePassword } from './password-policy.js';
import { env } from '../../utils/env.js';
import { generateResetToken, hashResetToken } from '../../utils/security/password-reset-token.js';

import type { PasswordResetRepository } from '../../repositories/auth/password-reset.repository.interface.js';
import type { Mailer } from '../mail/mail.types.js';

type UserLite = {
    id: number;
    mail: string;
    username: string;
};

type UserRepository = {
    findByEmail(mail: string): Promise<UserLite | null>;
    findById(id: number): Promise<UserLite | null>;
    updatePassword(userId: number, passwordHash: string): Promise<void>;
};

const PASSWORD_RESET_TTL_MINUTES = 30;

export class PasswordResetService {
    constructor(private readonly users: UserRepository, private readonly resets: PasswordResetRepository, private readonly mailer: Mailer, private readonly appBaseUrl: string) { }

    async requestReset(mail: string): Promise<void> {
        const normalizedMail = mail.trim().toLowerCase();
        if (!normalizedMail)
            return;

        const user = await this.users.findByEmail(normalizedMail);

        if (!user)
            return;

        await this.resets.invalidateAllForUser(user.id);

        const token = generateResetToken();
        const tokenHash = hashResetToken(token);
        await this.resets.create({ userId: user.id, tokenHash, expiresInMinutes: PASSWORD_RESET_TTL_MINUTES });

        const resetUrl = `${this.appBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;

        await this.mailer.sendPasswordResetEmail({ to: user.mail, username: user.username, resetUrl });
    }

    async resetPassword(token: string, newPassword: string): Promise<void> {
        const normalizedToken = token.trim();

        if (!normalizedToken)
            throw new Error('Reset token is required');

        const passwordError = validatePassword(newPassword);
        if (passwordError)
            throw new Error(passwordError);

        const tokenHash = hashResetToken(normalizedToken);
        const reset = await this.resets.findValidByTokenHash(tokenHash);

        if (!reset)
            throw new Error('Invalid or expired reset token');

        const passwordHash = await bcrypt.hash(newPassword, env.auth.bcryptCost);

        await this.users.updatePassword(reset.UserId, passwordHash);
        await this.resets.markUsed(reset.Id);

        const user = await this.users.findById(reset.UserId);
        if (user)
            await this.mailer.sendPasswordChangedEmail({ to: user.mail, username: user.username });
    }
}
