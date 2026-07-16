import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPaginatedResult, formatLimitOffsetClause, parsePaginationQuery } from '../../src/utils/pagination.js';
import { HttpError } from '../../src/utils/errors.js';

function assertHttpError(error: unknown, code: string, status: number): void {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
}

describe('pagination', () => {
    it('uses default page and limit when omitted', () => {
        assert.deepEqual(parsePaginationQuery({}, 12, 'RECIPES_PAGINATION'), {
            page: 1,
            limit: 12,
            offset: 0
        });
    });

    it('parses page and limit and computes offset', () => {
        assert.deepEqual(parsePaginationQuery({ page: '2', limit: '12' }, 12, 'RECIPES_PAGINATION'), {
            page: 2,
            limit: 12,
            offset: 12
        });
    });

    it('caps limit to 50', () => {
        assert.deepEqual(parsePaginationQuery({ page: '3', limit: '100' }, 12, 'RECIPES_PAGINATION'), {
            page: 3,
            limit: 50,
            offset: 100
        });
    });

    it('rejects invalid page values', () => {
        assert.throws(
            () => parsePaginationQuery({ page: '0' }, 12, 'RECIPES_PAGINATION'),
            (error) => {
                assertHttpError(error, 'RECIPES_PAGINATION_BAD_PAGE', 400);

                return true;
            }
        );
    });

    it('rejects invalid limit values', () => {
        assert.throws(
            () => parsePaginationQuery({ limit: '0' }, 12, 'RECIPES_PAGINATION'),
            (error) => {
                assertHttpError(error, 'RECIPES_PAGINATION_BAD_LIMIT', 400);

                return true;
            }
        );
    });

    it('rejects invalid query and pagination value types', () => {
        assert.throws(
            () => parsePaginationQuery(null, 12, 'RECIPES_PAGINATION'),
            (error) => {
                assertHttpError(error, 'RECIPES_PAGINATION_BAD_QUERY', 400);

                return true;
            }
        );

        assert.throws(
            () => parsePaginationQuery({ page: 2 }, 12, 'RECIPES_PAGINATION'),
            (error) => {
                assertHttpError(error, 'RECIPES_PAGINATION_BAD_PAGE', 400);

                return true;
            }
        );

        assert.throws(
            () => parsePaginationQuery({ limit: 12 }, 12, 'RECIPES_PAGINATION'),
            (error) => {
                assertHttpError(error, 'RECIPES_PAGINATION_BAD_LIMIT', 400);

                return true;
            }
        );
    });

    it('creates pagination metadata from a total count', () => {
        assert.deepEqual(createPaginatedResult(['one'], 25, { page: 2, limit: 12, offset: 12 }), {
            items: ['one'],
            pagination: {
                page: 2,
                limit: 12,
                totalItems: 25,
                totalPages: 3,
                hasNextPage: true,
                hasPreviousPage: true
            }
        });
    });

    it('formats safe SQL limit and offset literals', () => {
        assert.equal(formatLimitOffsetClause({ page: 2, limit: 12, offset: 12 }), 'LIMIT 12 OFFSET 12');
    });

    it('rejects unsafe SQL limit and offset values', () => {
        assert.throws(
            () => formatLimitOffsetClause({ page: 1, limit: Number.NaN, offset: 0 }),
            (error) => {
                assertHttpError(error, 'PAGINATION_BAD_LIMIT', 400);

                return true;
            }
        );

        assert.throws(
            () => formatLimitOffsetClause({ page: 1, limit: 12, offset: -1 }),
            (error) => {
                assertHttpError(error, 'PAGINATION_BAD_OFFSET', 400);

                return true;
            }
        );
    });
});
