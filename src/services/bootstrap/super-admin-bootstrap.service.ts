import { env } from '../../utils/env.js';
import { badRequest, conflict, internalError } from '../../utils/errors.js';
import { generateBootstrapInvitationToken, hashBootstrapInvitationToken } from '../../utils/security/bootstrap-invitation-token.js';
import { normalizeEmail } from '../../utils/string.js';

import type { SuperAdminBootstrapRepository } from '../../repositories/bootstrap/super-admin-bootstrap.repository.interface.js';
import type { SuperAdminBootstrapInvitationMailer } from '../mail/mail.types.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 255;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 64;

type BootstrapOptions = {
    invitationTtlMinutes?: number;
    generateToken?: () => string;
    hashToken?: (token: string) => string;
};

export class SuperAdminBootstrapService {
    private readonly invitationTtlMinutes: number;
    private readonly generateToken: () => string;
    private readonly hashToken: (token: string) => string;

    constructor(
        private readonly repository: SuperAdminBootstrapRepository,
        private readonly mailer: SuperAdminBootstrapInvitationMailer,
        private readonly appBaseUrl: string,
        options: BootstrapOptions = {}
    ) {
        this.invitationTtlMinutes = options.invitationTtlMinutes ?? env.bootstrap.superAdminInvitationTtlMinutes;
        this.generateToken = options.generateToken ?? generateBootstrapInvitationToken;
        this.hashToken = options.hashToken ?? hashBootstrapInvitationToken;

        if (!Number.isInteger(this.invitationTtlMinutes) || this.invitationTtlMinutes <= 0)
            throw new TypeError('SuperAdmin invitation TTL must be a positive integer');
    }

    async bootstrap(input: { mail: string; username: string }): Promise<{ userId: number }> {
        const mail = normalizeEmail(input.mail);
        const username = input.username.trim();

        if (!mail)
            throw badRequest('Email is required', 'BOOTSTRAP_SUPER_ADMIN_MISSING_EMAIL');
        if (mail.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(mail))
            throw badRequest('Invalid email', 'BOOTSTRAP_SUPER_ADMIN_INVALID_EMAIL');

        if (!username)
            throw badRequest('Username is required', 'BOOTSTRAP_SUPER_ADMIN_MISSING_USERNAME');
        if (username.length < MIN_USERNAME_LENGTH)
            throw badRequest('Username too short', 'BOOTSTRAP_SUPER_ADMIN_WEAK_USERNAME');
        if (username.length > MAX_USERNAME_LENGTH)
            throw badRequest('Username too long', 'BOOTSTRAP_SUPER_ADMIN_USERNAME_TOO_LONG');

        const invitationToken = this.generateToken();
        const invitationTokenHash = this.hashToken(invitationToken);
        const result = await this.repository.createFirst({
            mail,
            username,
            invitationTokenHash,
            invitationTtlMinutes: this.invitationTtlMinutes
        });

        switch (result.status) {
            case 'created': {
                const invitationUrl = `${this.appBaseUrl.replace(/\/+$/, '')}/auth/staff-invitation?token=${encodeURIComponent(invitationToken)}`;
                try {
                    await this.mailer.sendSuperAdminBootstrapInvitationEmail({
                        to: mail,
                        username,
                        invitationUrl,
                        expiresInMinutes: this.invitationTtlMinutes
                    });
                } catch (error) {
                    await this.repository.cancelPendingInvitation(result.userId, invitationTokenHash);
                    throw error;
                }
                return { userId: result.userId };
            }
            case 'super_admin_exists':
                if (result.active)
                    throw conflict('An active SuperAdmin already exists', 'SUPER_ADMIN_ALREADY_EXISTS');
                throw conflict( 'The first SuperAdmin has already been bootstrapped', 'BOOTSTRAP_SUPER_ADMIN_ALREADY_COMPLETED');
            case 'email_taken':
                throw conflict('Email already used', 'BOOTSTRAP_SUPER_ADMIN_EMAIL_TAKEN');
            case 'username_taken':
                throw conflict('Username already used', 'BOOTSTRAP_SUPER_ADMIN_USERNAME_TAKEN');
            case 'role_missing':
                throw internalError('SuperAdmin role is missing; apply the central seed before running this command', 'BOOTSTRAP_SUPER_ADMIN_ROLE_MISSING');
        }
    }
}
