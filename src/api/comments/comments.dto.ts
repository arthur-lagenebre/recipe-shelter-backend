import { badRequest } from '../../utils/errors.js';
import { getOptionalNullableNumber, getRequiredBoundedString, isRecord } from '../http/dto.helpers.js';

const MIN_COMMENT_LENGTH = 1;
const MAX_COMMENT_LENGTH = 2000;

export type CreateCommentBody = {
    parentCommentId?: number | null;
    rating?: number | null;
    comment: string;
};

export type UpdateCommentBody = {
    rating?: number | null;
    comment: string;
};

function parsePositiveIntegerParam(value: unknown, message: string, code: string): number {
    const id = typeof value === 'string' ? Number(value) : NaN;

    if (!Number.isInteger(id) || id <= 0)
        throw badRequest(message, code);

    return id;
}

function parseRating(value: unknown, codePrefix: 'COMMENTS_CREATE' | 'COMMENTS_UPDATE'): number | null | undefined {
    const rating = getOptionalNullableNumber(value, 'Rating must be a number or null', `${codePrefix}_BAD_RATING`);

    if (rating !== undefined && rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5))
        throw badRequest('Rating must be between 1 and 5', `${codePrefix}_BAD_RATING`);

    return rating;
}

function parseParentCommentId(value: unknown): number | null | undefined {
    const parentCommentId = getOptionalNullableNumber(
        value,
        'Parent comment id must be a number or null',
        'COMMENTS_CREATE_BAD_PARENT_COMMENT_ID'
    );

    if (parentCommentId !== undefined && parentCommentId !== null && (!Number.isInteger(parentCommentId) || parentCommentId <= 0))
        throw badRequest('Parent comment id must be a positive integer', 'COMMENTS_CREATE_BAD_PARENT_COMMENT_ID');

    return parentCommentId;
}

export function parseCreateCommentBody(body: unknown): CreateCommentBody {
    if (!isRecord(body))
        throw badRequest('Invalid body', 'COMMENTS_CREATE_BAD_BODY');

    const comment = getRequiredBoundedString(
        body.comment,
        MIN_COMMENT_LENGTH,
        MAX_COMMENT_LENGTH,
        'Comment is required',
        'COMMENTS_CREATE_MISSING_COMMENT'
    );
    const parentCommentId = parseParentCommentId(body.parentCommentId);
    const rating = parseRating(body.rating, 'COMMENTS_CREATE');

    if (parentCommentId !== undefined && parentCommentId !== null && rating !== undefined && rating !== null)
        throw badRequest('Reply comments cannot have a rating', 'COMMENTS_CREATE_REPLY_WITH_RATING');

    return { parentCommentId, rating, comment };
}

export function parseUpdateCommentBody(body: unknown): UpdateCommentBody {
    if (!isRecord(body))
        throw badRequest('Invalid body', 'COMMENTS_UPDATE_BAD_BODY');

    const comment = getRequiredBoundedString(
        body.comment,
        MIN_COMMENT_LENGTH,
        MAX_COMMENT_LENGTH,
        'Comment is required',
        'COMMENTS_UPDATE_MISSING_COMMENT'
    );

    return { rating: parseRating(body.rating, 'COMMENTS_UPDATE'), comment };
}

export function parseCommentIdParam(value: unknown): number {
    return parsePositiveIntegerParam(value, 'Comment id must be a positive integer', 'COMMENTS_BAD_ID');
}

export function parseRecipeIdParam(value: unknown): number {
    return parsePositiveIntegerParam(value, 'Recipe id must be a positive integer', 'COMMENTS_BAD_RECIPE_ID');
}
