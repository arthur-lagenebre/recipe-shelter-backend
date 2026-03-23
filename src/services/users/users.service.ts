import bcrypt from 'bcrypt';

import { badRequest, conflict, notFound, unauthorized } from '../../utils/errors.js';
import { validatePassword } from '../auth/password-policy.js';

import type { UserRepository } from '../../repositories/users/user-repository.interface.js';

export type PublicUserProfile = {
    id: number;
    mail: string;
    username: string;
    roleId: number;
    createdAt: Date;
    updatedAt: Date;
};

export class UserService {
    constructor(private readonly userRepository: UserRepository) { }

    async getMe(userId: number): Promise<PublicUserProfile> {
        const user = await this.userRepository.findById(userId);

        if (!user)
            throw notFound('User not found', 'USER_NOT_FOUND');

        return {
            id: user.id,
            mail: user.mail,
            username: user.username,
            roleId: user.roleId,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        };
    }

    async updateEmail(userId: number, newEmail: string, currentPassword: string): Promise<PublicUserProfile> {
        const normalizedEmail = newEmail.trim().toLowerCase();

        if (!normalizedEmail)
            throw badRequest('New email is required', 'USERS_UPDATE_EMAIL_MISSING_EMAIL');

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(normalizedEmail))
            throw badRequest('Invalid email format', 'USERS_UPDATE_EMAIL_INVALID_EMAIL');

        const user = await this.userRepository.findWithPasswordById(userId);

        if (!user)
            throw notFound('User not found', 'USER_NOT_FOUND');

        const passwordOk = await bcrypt.compare(currentPassword, user.passwordHash);

        if (!passwordOk)
            throw unauthorized('Current password is incorrect', 'USERS_UPDATE_EMAIL_BAD_PASSWORD');

        if (user.mail.toLowerCase() === normalizedEmail)
            throw badRequest('New email must be different from current email', 'USERS_UPDATE_EMAIL_SAME_EMAIL');

        const existingUser = await this.userRepository.findByEmail(normalizedEmail);

        if (existingUser && existingUser.id !== userId)
            throw conflict('Email already in use', 'USERS_UPDATE_EMAIL_ALREADY_USED');

        await this.userRepository.updateEmail(userId, normalizedEmail);

        return this.getMe(userId);
    }

    async updatePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
        const user = await this.userRepository.findWithPasswordById(userId);

        if (!user)
            throw notFound('User not found', 'USER_NOT_FOUND');

        const passwordOk = await bcrypt.compare(currentPassword, user.passwordHash);

        if (!passwordOk)
            throw unauthorized('Current password is incorrect', 'USERS_UPDATE_PASSWORD_BAD_CURRENT');

        if (currentPassword === newPassword)
            throw badRequest('New password must be different from current password', 'USERS_UPDATE_PASSWORD_SAME_PASSWORD');

        validatePassword(newPassword);

        const newPasswordHash = await bcrypt.hash(newPassword, 12);

        await this.userRepository.updatePassword(userId, newPasswordHash);
    }
}