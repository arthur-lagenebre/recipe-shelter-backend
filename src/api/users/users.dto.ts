import { badRequest } from '../../utils/errors.js';
import { isRecord } from '../http/dto.helpers.js';

export type UpdateEmailInput = {
    newEmail: string;
    currentPassword: string;
};

export type UpdatePasswordInput = {
    currentPassword: string;
    newPassword: string;
};

export type UpdateUsernameInput = {
    newUsername: string;
    currentPassword: string;
};

export function parseUpdateEmailBody(body: unknown): UpdateEmailInput {
    if (!isRecord(body))
        throw badRequest('Invalid body', 'USERS_UPDATE_EMAIL_BAD_BODY');

    const newEmail = typeof body.newEmail === 'string' ? body.newEmail.trim() : '';
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';

    if (!newEmail)
        throw badRequest('New email is required', 'USERS_UPDATE_EMAIL_MISSING_EMAIL');

    if (!currentPassword)
        throw badRequest('Current password is required', 'USERS_UPDATE_EMAIL_MISSING_PASSWORD');

    return { newEmail, currentPassword };
}

export function parseUpdatePasswordBody(body: unknown): UpdatePasswordInput {
    if (!isRecord(body))
        throw badRequest('Invalid body', 'USERS_UPDATE_PASSWORD_BAD_BODY');

    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!currentPassword)
        throw badRequest('Current password is required', 'USERS_UPDATE_PASSWORD_MISSING_CURRENT');

    if (!newPassword)
        throw badRequest('New password is required', 'USERS_UPDATE_PASSWORD_MISSING_NEW');

    return { currentPassword, newPassword };
}

export function parseUpdateUsernameBody(body: unknown): UpdateUsernameInput {
    if (!isRecord(body))
        throw badRequest('Invalid body', 'USERS_UPDATE_USERNAME_BAD_BODY');

    const newUsername = typeof body.newUsername === 'string' ? body.newUsername.trim() : '';
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';

    if (!newUsername)
        throw badRequest('New username is required', 'USERS_UPDATE_USERNAME_MISSING_USERNAME');

    if (!currentPassword)
        throw badRequest('Current password is required', 'USERS_UPDATE_USERNAME_MISSING_PASSWORD');

    return { newUsername, currentPassword };
}

export function parseUsernameParam(value: unknown): string {
    const username = typeof value === 'string' ? value.trim() : '';

    if (!username)
        throw badRequest('Username is required', 'USERS_MISSING_USERNAME');

    return username;
}
