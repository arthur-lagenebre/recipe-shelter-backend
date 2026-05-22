import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { errorHandler } from '../../src/middlewares/error-handler.js';
import { HttpError } from '../../src/utils/errors.js';

function createResponse() {
    return {
        statusCode: 0,
        body: null as unknown,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(payload: unknown) {
            this.body = payload;
            return this;
        }
    };
}

describe('errorHandler', () => {
    it('serializes HttpError instances', () => {
        const res = createResponse();

        errorHandler(new HttpError(409, 'Already exists', 'CONFLICT'), null as never, res as never, null as never);

        assert.equal(res.statusCode, 409);
        assert.deepEqual(res.body, { error: { message: 'Already exists', code: 'CONFLICT' } });
    });

    it('hides unexpected errors behind a generic 500', () => {
        const res = createResponse();
        const originalError = console.error;
        console.error = () => undefined;

        try {
            errorHandler(new Error('Database exploded'), null as never, res as never, null as never);
        } finally {
            console.error = originalError;
        }

        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { error: { message: 'Database exploded', code: 'INTERNAL_ERROR' } });
    });
});
