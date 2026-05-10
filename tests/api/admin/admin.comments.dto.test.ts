import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseAdminCommentIdParam, parseAdminUpdateCommentBody } from '../../../src/api/admin/admin.comments.dto.js';
import { HttpError } from '../../../src/utils/errors.js';

function assertHttpError(error: unknown, code: string, status: number): void {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
}

describe('admin.comments.dto', () => {
    it('parses a comment id param', () => {
        assert.equal(parseAdminCommentIdParam('12'), 12);
    });

    it('rejects an invalid comment id param', () => {
        assert.throws(
            () => parseAdminCommentIdParam('abc'),
            (error) => {
                assertHttpError(error, 'ADMIN_COMMENTS_BAD_ID', 400);

                return true;
            }
        );
    });

    it('parses an admin update body', () => {
        const result = parseAdminUpdateCommentBody({
            rating: null,
            comment: 'Commentaire corrige'
        });

        assert.deepEqual(result, {
            rating: null,
            comment: 'Commentaire corrige'
        });
    });

    it('rejects an invalid rating', () => {
        assert.throws(
            () => parseAdminUpdateCommentBody({
                rating: 6,
                comment: 'Note invalide'
            }),
            (error) => {
                assertHttpError(error, 'ADMIN_COMMENTS_UPDATE_BAD_RATING', 400);

                return true;
            }
        );
    });

    it('rejects a missing comment', () => {
        assert.throws(
            () => parseAdminUpdateCommentBody({
                rating: 4
            }),
            (error) => {
                assertHttpError(error, 'ADMIN_COMMENTS_UPDATE_MISSING_COMMENT', 400);

                return true;
            }
        );
    });
});
