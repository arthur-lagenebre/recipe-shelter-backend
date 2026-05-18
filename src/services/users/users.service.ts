import bcrypt from 'bcrypt';

import { badRequest, conflict, notFound, unauthorized } from '../../utils/errors.js';
import { validatePassword } from '../auth/password-policy.js';

import type { RecipeRepository } from '../../repositories/recipes/recipe.repository.interface.js';
import type { RecipeListItem } from '../../repositories/recipes/recipe.types.js';
import type { UserRepository } from '../../repositories/users/user.repository.interface.js';

export type PublicUserProfile = {
    id: number;
    mail: string;
    username: string;
    roleId: number;
    createdAt: Date;
    updatedAt: Date;
};

export type PublicUserWithPublishedRecipes = {
    id: number;
    username: string;
    publishedRecipes: RecipeListItem[];
};

export class UserService {
    constructor(private readonly userRepository: UserRepository, private readonly recipeRepository: RecipeRepository) { }

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

    async getUser(username: string, viewerUserId: number | null = null): Promise<PublicUserWithPublishedRecipes> {
        const user = await this.userRepository.findByUsername(username.trim());

        if (!user)
            throw notFound('User not found', 'USER_NOT_FOUND');

        const publishedRecipes = await this.recipeRepository.findPublishedByAuthorId(viewerUserId, user.id);

        return {
            id: user.id,
            username: user.username,
            publishedRecipes
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

        const passwordError = validatePassword(newPassword);

        if (passwordError)
            throw badRequest(passwordError, 'USERS_UPDATE_PASSWORD_WEAK_PASSWORD');

        const newPasswordHash = await bcrypt.hash(newPassword, 12);

        await this.userRepository.updatePassword(userId, newPasswordHash);
    }

    async updateUsername(userId: number, currentPassword: string, newUsername: string): Promise<PublicUserProfile> {
        const username = newUsername.trim();

        if (!username)
            throw badRequest('New username is required', 'USERS_UPDATE_USERNAME_MISSING_USERNAME');

        if (username.length < 3)
            throw badRequest('Username too short', 'USERS_UPDATE_USERNAME_WEAK_USERNAME');

        const user = await this.userRepository.findWithPasswordById(userId);

        if (!user)
            throw notFound('User not found', 'USER_NOT_FOUND');

        const passwordOk = await bcrypt.compare(currentPassword, user.passwordHash);

        if (!passwordOk)
            throw unauthorized('Current password is incorrect', 'USERS_UPDATE_USERNAME_BAD_PASSWORD');

        if (user.username === username)
            throw badRequest('New username must be different from current username', 'USERS_UPDATE_USERNAME_SAME_USERNAME');

        const existingUser = await this.userRepository.findByUsername(username);

        if (existingUser && existingUser.id !== userId)
            throw conflict('Username already in use', 'USERS_UPDATE_USERNAME_ALREADY_USED');

        await this.userRepository.updateUsername(userId, username);

        return this.getMe(userId);
    }
}
