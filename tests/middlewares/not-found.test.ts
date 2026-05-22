import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { notFound } from '../../src/middlewares/not-found.js';
describe('notFound middleware', () => {
    it('passes a 404 error to next', () => {
        let nextError: unknown;

        notFound(null as never, null as never, (error) => {
            nextError = error;
        });

        assert.deepEqual(nextError, {
            statusCode: 404,
            message: 'Route not found',
            code: 'ROUTE_NOT_FOUND'
        });
    });
});
