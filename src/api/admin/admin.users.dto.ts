import { badRequest } from '../../utils/errors.js';
import { getRequiredString, isRecord } from '../http/dto.helpers.js';

const MODERATION_REASON_MIN_LENGTH = 10;
const MODERATION_REASON_MAX_LENGTH = 1000;

export function parseAdminUserIdParam(value: unknown): number {
    const id = typeof value === 'string' ? Number(value) : NaN;

    if (!Number.isInteger(id) || id <= 0) throw badRequest('User id must be a positive integer', 'ADMIN_USERS_BAD_ID');

    return id;
}

export function parseBanUserBody(body: unknown): string {
    return parseModerationReasonBody(body, {
        invalidBodyCode: 'ADMIN_USERS_BAN_BAD_BODY',
        missingReasonCode: 'ADMIN_USERS_BAN_MISSING_REASON',
        reasonLabel: 'Ban reason'
    });
}

export function parseUnbanUserBody(body: unknown): string {
    return parseModerationReasonBody(body, {
        invalidBodyCode: 'ADMIN_USERS_UNBAN_BAD_BODY',
        missingReasonCode: 'ADMIN_USERS_UNBAN_MISSING_REASON',
        reasonLabel: 'Unban reason'
    });
}

function parseModerationReasonBody(
    body: unknown,
    options: { invalidBodyCode: string; missingReasonCode: string; reasonLabel: string }
): string {
    if (!isRecord(body)) throw badRequest('Invalid body', options.invalidBodyCode);

    const reason = getRequiredString(body.reason, `${options.reasonLabel} is required`, options.missingReasonCode);

    if (reason.length < MODERATION_REASON_MIN_LENGTH)
        throw badRequest(
            `${options.reasonLabel} must be at least ${MODERATION_REASON_MIN_LENGTH} characters`,
            `${options.missingReasonCode.replace('MISSING_REASON', 'REASON_TOO_SHORT')}`
        );

    if (reason.length > MODERATION_REASON_MAX_LENGTH)
        throw badRequest(
            `${options.reasonLabel} must be at most ${MODERATION_REASON_MAX_LENGTH} characters`,
            `${options.missingReasonCode.replace('MISSING_REASON', 'REASON_TOO_LONG')}`
        );

    return reason;
}
