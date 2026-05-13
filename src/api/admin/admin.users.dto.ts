import { badRequest } from '../../utils/errors.js';
import { getRequiredString, isRecord } from '../http/dto.helpers.js';

export function parseAdminUserIdParam(value: unknown): number {
    const id = typeof value === 'string' ? Number(value) : NaN;

    if (!Number.isInteger(id) || id <= 0)
        throw badRequest('User id must be a positive integer', 'ADMIN_USERS_BAD_ID');

    return id;
}

export function parseBanUserBody(body: unknown): string {
    if (!isRecord(body))
        throw badRequest('Invalid body', 'ADMIN_USERS_BAN_BAD_BODY');

    const reason = getRequiredString(body.reason, 'Ban reason is required', 'ADMIN_USERS_BAN_MISSING_REASON');

    if (reason.length < 10)
        throw badRequest('Ban reason must be at least 10 characters', 'ADMIN_USERS_BAN_REASON_TOO_SHORT');

    return reason;
}
