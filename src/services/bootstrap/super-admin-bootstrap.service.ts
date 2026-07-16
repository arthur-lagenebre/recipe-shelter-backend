import bcrypt from 'bcrypt';

import { env } from '../../utils/env.js';
import { badRequest, conflict, internalError } from '../../utils/errors.js';
import { normalizeEmail } from '../../utils/string.js';
import { validatePassword } from '../auth/password-policy.js';

import type { SuperAdminBootstrapRepository } from '../../repositories/bootstrap/super-admin-bootstrap.repository.interface.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 255;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 64;

type PasswordHasher = (password: string) => Promise<string>;

export class SuperAdminBootstrapService {
    constructor(
        private readonly repository: SuperAdminBootstrapRepository,
        private readonly hashPassword: PasswordHasher = (password) => bcrypt.hash(password, env.auth.bcryptCost)
    ) { }

    async bootstrap(input: { mail: string; username: string; password: string }): Promise<{ userId: number }> {
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

        const passwordError = validatePassword(input.password);
        if (passwordError)
            throw badRequest(passwordError, 'BOOTSTRAP_SUPER_ADMIN_WEAK_PASSWORD');

        const passwordHash = await this.hashPassword(input.password);
        const result = await this.repository.createFirst({ mail, username, passwordHash });

        switch (result.status) {
            case 'created':
                return { userId: result.userId };
            case 'super_admin_exists':
                if (result.active)
                    throw conflict('An active SuperAdmin already exists', 'BOOTSTRAP_SUPER_ADMIN_ACTIVE_EXISTS');
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
