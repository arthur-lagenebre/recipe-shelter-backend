import { badRequest } from '../../utils/errors.js';
import { getOptionalNullableNumber, getRequiredString, isRecord } from '../http/dto.helpers.js';

const MODERATION_REASON_MIN_LENGTH = 10;
const MODERATION_REASON_MAX_LENGTH = 1000;

export type AdminUpdateCommentBody = {
    rating?: number | null;
    comment: string;
};

export function parseAdminCommentIdParam(value: unknown): number {
    const id = typeof value === 'string' ? Number(value) : NaN;

    if (!Number.isInteger(id) || id <= 0) throw badRequest('Comment id must be a positive integer', 'ADMIN_COMMENTS_BAD_ID');

    return id;
}

export function parseHideCommentBody(body: unknown): string {
    if (!isRecord(body)) throw badRequest('Invalid body', 'ADMIN_COMMENTS_HIDE_BAD_BODY');

    const reason = getRequiredString(body.reason, 'Hide reason is required', 'ADMIN_COMMENTS_HIDE_MISSING_REASON');

    if (reason.length < MODERATION_REASON_MIN_LENGTH)
        throw badRequest(`Hide reason must be at least ${MODERATION_REASON_MIN_LENGTH} characters`, 'ADMIN_COMMENTS_HIDE_REASON_TOO_SHORT');
    if (reason.length > MODERATION_REASON_MAX_LENGTH)
        throw badRequest(`Hide reason must be at most ${MODERATION_REASON_MAX_LENGTH} characters`, 'ADMIN_COMMENTS_HIDE_REASON_TOO_LONG');

    return reason;
}

export function parseAdminUpdateCommentBody(body: unknown): AdminUpdateCommentBody {
    if (!isRecord(body)) throw badRequest('Invalid body', 'ADMIN_COMMENTS_UPDATE_BAD_BODY');

    const comment = getRequiredString(body.comment, 'Comment is required', 'ADMIN_COMMENTS_UPDATE_MISSING_COMMENT');
    const rating = getOptionalNullableNumber(body.rating, 'Rating must be a number or null', 'ADMIN_COMMENTS_UPDATE_BAD_RATING');

    if (rating !== undefined && rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5))
        throw badRequest('Rating must be between 1 and 5', 'ADMIN_COMMENTS_UPDATE_BAD_RATING');

    return { rating, comment };
}
