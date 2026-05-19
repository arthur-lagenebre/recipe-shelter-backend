import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { rateLimiter } from '../../src/middlewares/rate-limiter.js';

import type { NextFunction, Request, Response } from 'express';

type MockResponse = Pick<Response, 'json' | 'setHeader' | 'status'> & {
    body?: unknown;
    headers: Record<string, string>;
    statusCode?: number;
};

function createRequest(path: string, ip = '127.0.0.1'): Request {
    return {
        baseUrl: '/api/v1/auth',
        ip,
        method: 'POST',
        path
    } as Request;
}

function createResponse(): MockResponse {
    const response: MockResponse = {
        headers: {},
        json(body: unknown) {
            response.body = body;

            return response as Response;
        },
        setHeader(name: string, value: number | string | readonly string[]) {
            response.headers[name] = String(value);

            return response as Response;
        },
        status(statusCode: number) {
            response.statusCode = statusCode;

            return response as Response;
        }
    };

    return response;
}

function runLimiter(limiter: ReturnType<typeof rateLimiter>, req: Request): { nextCalled: boolean; res: MockResponse } {
    const res = createResponse();
    let nextCalled = false;
    const next: NextFunction = () => {
        nextCalled = true;
    };

    limiter(req, res as Response, next);

    return { nextCalled, res };
}

describe('rateLimiter', () => {
    it('limits repeated requests to the same endpoint', () => {
        const limiter = rateLimiter(2, 60_000);

        assert.equal(runLimiter(limiter, createRequest('/login')).nextCalled, true);
        assert.equal(runLimiter(limiter, createRequest('/login')).nextCalled, true);

        const blocked = runLimiter(limiter, createRequest('/login'));

        assert.equal(blocked.nextCalled, false);
        assert.equal(blocked.res.statusCode, 429);
        assert.equal(blocked.res.headers['RateLimit-Remaining'], '0');
        assert.equal(blocked.res.headers['Retry-After'], '60');
        assert.deepEqual(blocked.res.body, {
            error: {
                message: 'Too many requests',
                code: 'RATE_LIMIT'
            }
        });
    });

    it('keeps separate buckets per endpoint', () => {
        const limiter = rateLimiter(1, 60_000);
        const ip = '127.0.0.2';

        assert.equal(runLimiter(limiter, createRequest('/login', ip)).nextCalled, true);
        assert.equal(runLimiter(limiter, createRequest('/register', ip)).nextCalled, true);

        const blocked = runLimiter(limiter, createRequest('/login', ip));

        assert.equal(blocked.nextCalled, false);
        assert.equal(blocked.res.statusCode, 429);
    });
});
