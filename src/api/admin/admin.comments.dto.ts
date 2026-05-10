import { badRequest } from '../../utils/errors.js';
import { getOptionalNullableNumber, getRequiredString, isRecord } from '../http/dto.helpers.js';

export type AdminUpdateCommentBody = {
    rating?: number | null;
    comment: string;
};

export function parseAdminCommentIdParam(value: unknown): number {
    const id = typeof value === 'string' ? Number(value) : NaN;

    if (!Number.isInteger(id) || id <= 0)
        throw badRequest('Comment id must be a positive integer', 'ADMIN_COMMENTS_BAD_ID');

    return id;
}

export function parseAdminUpdateCommentBody(body: unknown): AdminUpdateCommentBody {
    if (!isRecord(body))
        throw badRequest('Invalid body', 'ADMIN_COMMENTS_UPDATE_BAD_BODY');

    const comment = getRequiredString(body.comment, 'Comment is required', 'ADMIN_COMMENTS_UPDATE_MISSING_COMMENT');
    const rating = getOptionalNullableNumber(body.rating, 'Rating must be a number or null', 'ADMIN_COMMENTS_UPDATE_BAD_RATING');

    if (rating !== undefined && rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5))
        throw badRequest('Rating must be between 1 and 5', 'ADMIN_COMMENTS_UPDATE_BAD_RATING');

    return { rating, comment };
}
