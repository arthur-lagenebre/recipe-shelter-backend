import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { rateLimiter, sweepExpiredEntries } from '../../src/middlewares/rate-limiter.js';

import type { NextFunction, Request, Response } from 'express';

type MockResponse = {
    body?: unknown;
    headers: Record<string, string>;
    statusCode?: number;
    json(body: unknown): MockResponse;
    setHeader(name: string, value: number | string | readonly string[]): MockResponse;
    status(statusCode: number): MockResponse;
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

            return response;
        },
        setHeader(name: string, value: number | string | readonly string[]) {
            response.headers[name] = String(value);

            return response;
        },
        status(statusCode: number) {
            response.statusCode = statusCode;

            return response;
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

    limiter(req, res as unknown as Response, next);

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

    it('resets buckets after the rate limit window expires', () => {
        const originalNow = Date.now;
        let now = 1_000;
        Date.now = () => now;

        try {
            const limiter = rateLimiter(1, 1_000);
            const req = createRequest('/login', '127.0.0.3');

            assert.equal(runLimiter(limiter, req).nextCalled, true);
            now = 2_001;

            const afterReset = runLimiter(limiter, req);

            assert.equal(afterReset.nextCalled, true);
            assert.equal(afterReset.res.statusCode, undefined);
            assert.equal(afterReset.res.headers['RateLimit-Remaining'], '0');
        } finally {
            Date.now = originalNow;
        }
    });
});

describe('sweepExpiredEntries', () => {
    it('evicts expired entries and keeps valid ones', () => {
        const now = 10_000;
        const attempts = new Map<string, { count: number; resetAt: number }>([
            ['expired-1', { count: 1, resetAt: now - 1 }],
            ['expired-2', { count: 3, resetAt: now - 500 }],
            ['valid', { count: 1, resetAt: now + 1_000 }]
        ]);

        const evictedCount = sweepExpiredEntries(attempts, now);

        assert.equal(evictedCount, 2);
        assert.equal(attempts.size, 1);
        assert.equal(attempts.has('valid'), true);
    });

    it('returns 0 and does not throw for an empty map', () => {
        const attempts = new Map<string, { count: number; resetAt: number }>();

        assert.equal(sweepExpiredEntries(attempts, 10_000), 0);
        assert.equal(attempts.size, 0);
    });

    it('leaves the map untouched when no entries are expired', () => {
        const now = 10_000;
        const attempts = new Map<string, { count: number; resetAt: number }>([
            ['a', { count: 1, resetAt: now + 1 }],
            ['b', { count: 2, resetAt: now + 1_000 }]
        ]);
        const before = new Map(attempts);

        const evictedCount = sweepExpiredEntries(attempts, now);

        assert.equal(evictedCount, 0);
        assert.equal(attempts.size, 2);
        assert.deepEqual(attempts, before);
    });

    it('does not evict an entry whose resetAt equals now', () => {
        const now = 10_000;
        const attempts = new Map<string, { count: number; resetAt: number }>([
            ['exact', { count: 1, resetAt: now }]
        ]);

        const evictedCount = sweepExpiredEntries(attempts, now);

        assert.equal(evictedCount, 0);
        assert.equal(attempts.size, 1);
        assert.equal(attempts.has('exact'), true);
    });
});
