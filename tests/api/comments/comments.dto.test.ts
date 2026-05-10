import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCreateCommentBody, parseUpdateCommentBody } from '../../../src/api/comments/comments.dto.js';
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
            () => parseCreateCommentBody({
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
            () => parseCreateCommentBody({
                rating: 6,
                comment: 'Too much'
            }),
            (error) => {
                assertHttpError(error, 'COMMENTS_CREATE_BAD_RATING', 400);

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
});
