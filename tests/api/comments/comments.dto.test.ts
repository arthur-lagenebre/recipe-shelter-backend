import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCommentIdParam, parseCreateCommentBody, parseRecipeIdParam, parseUpdateCommentBody } from '../../../src/api/comments/comments.dto.js';
import { HttpError } from '../../../src/utils/errors.js';

function assertHttpError(error: unknown, code: string, status: number): void {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
}

describe('comments.dto', () => {
    it('parses a root comment with a rating', () => {
        const result = parseCreateCommentBody({
            rating: 5,
            comment: 'Great recipe'
        });

        assert.deepEqual(result, {
            parentCommentId: undefined,
            rating: 5,
            comment: 'Great recipe'
        });
    });

    it('parses a reply without a rating', () => {
        const result = parseCreateCommentBody({
            parentCommentId: 12,
            comment: 'Thanks for the tip'
        });

        assert.deepEqual(result, {
            parentCommentId: 12,
            rating: undefined,
            comment: 'Thanks for the tip'
        });
    });

    it('rejects a reply with a rating', () => {
        assert.throws(
            () =>
                parseCreateCommentBody({
                    parentCommentId: 12,
                    rating: 4,
                    comment: 'Thanks, still rating this'
                }),
            (error) => {
                assertHttpError(error, 'COMMENTS_CREATE_REPLY_WITH_RATING', 400);

                return true;
            }
        );
    });

    it('rejects an invalid rating', () => {
        assert.throws(
            () => parseCreateCommentBody({ rating: 6, comment: 'Too much' }),
            (error) => {
                assertHttpError(error, 'COMMENTS_CREATE_BAD_RATING', 400);

                return true;
            }
        );
    });

    it('rejects invalid create bodies and parent ids', () => {
        assert.throws(
            () => parseCreateCommentBody(null),
            (error) => {
                assertHttpError(error, 'COMMENTS_CREATE_BAD_BODY', 400);

                return true;
            }
        );

        assert.throws(
            () => parseCreateCommentBody({ parentCommentId: 0, comment: 'Thanks' }),
            (error) => {
                assertHttpError(error, 'COMMENTS_CREATE_BAD_PARENT_COMMENT_ID', 400);

                return true;
            }
        );
    });

    it('rejects a comment longer than 2000 characters', () => {
        assert.throws(
            () => parseCreateCommentBody({ comment: 'a'.repeat(2001) }),
            (error) => {
                assertHttpError(error, 'COMMENTS_CREATE_MISSING_COMMENT', 400);

                return true;
            }
        );

        assert.throws(
            () => parseUpdateCommentBody({ comment: 'a'.repeat(2001) }),
            (error) => {
                assertHttpError(error, 'COMMENTS_UPDATE_MISSING_COMMENT', 400);

                return true;
            }
        );
    });

    it('parses an update body', () => {
        const result = parseUpdateCommentBody({
            rating: null,
            comment: 'Updated comment'
        });

        assert.deepEqual(result, {
            rating: null,
            comment: 'Updated comment'
        });
    });

    it('rejects invalid update bodies', () => {
        assert.throws(
            () => parseUpdateCommentBody(null),
            (error) => {
                assertHttpError(error, 'COMMENTS_UPDATE_BAD_BODY', 400);

                return true;
            }
        );

        assert.throws(
            () => parseUpdateCommentBody({ rating: 4 }),
            (error) => {
                assertHttpError(error, 'COMMENTS_UPDATE_MISSING_COMMENT', 400);

                return true;
            }
        );
    });

    it('parses and validates comment and recipe params', () => {
        assert.equal(parseCommentIdParam('8'), 8);
        assert.equal(parseRecipeIdParam('12'), 12);

        assert.throws(
            () => parseCommentIdParam('0'),
            (error) => {
                assertHttpError(error, 'COMMENTS_BAD_ID', 400);

                return true;
            }
        );

        assert.throws(
            () => parseRecipeIdParam('abc'),
            (error) => {
                assertHttpError(error, 'COMMENTS_BAD_RECIPE_ID', 400);

                return true;
            }
        );
    });
});
