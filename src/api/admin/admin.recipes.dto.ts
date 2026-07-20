import { badRequest } from '../../utils/errors.js';
import { getRequiredString } from '../http/dto.helpers.js';

const MODERATION_REASON_MIN_LENGTH = 10;
const MODERATION_REASON_MAX_LENGTH = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function parseRejectRecipeBody(body: unknown): string {
    return parseRecipeModerationReasonBody(body, 'reject');
}

export function parseArchiveRecipeBody(body: unknown): string {
    return parseRecipeModerationReasonBody(body, 'archive');
}

function parseRecipeModerationReasonBody(body: unknown, action: 'archive' | 'reject'): string {
    const codePrefix = `ADMIN_RECIPES_${action.toUpperCase()}`;
    const label = action === 'reject' ? 'Rejection' : 'Archive';

    if (!isRecord(body))
        throw badRequest('Invalid body', `${codePrefix}_BAD_BODY`);

    const reason = getRequiredString(body.reason, `${label} reason is required`, `${codePrefix}_MISSING_REASON`);

    if (reason.length < MODERATION_REASON_MIN_LENGTH)
        throw badRequest(`${label} reason must be at least ${MODERATION_REASON_MIN_LENGTH} characters`, `${codePrefix}_REASON_TOO_SHORT`);
    if (reason.length > MODERATION_REASON_MAX_LENGTH)
        throw badRequest(`${label} reason must be at most ${MODERATION_REASON_MAX_LENGTH} characters`, `${codePrefix}_REASON_TOO_LONG`);

    return reason;
}
