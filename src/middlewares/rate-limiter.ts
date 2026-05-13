import type { NextFunction, Request, Response } from 'express';

const attempts = new Map<string, { count: number; resetAt: number }>();

function getRequestKey(req: Request): string {
  return [
    req.ip ?? 'unknown',
    req.method,
    req.baseUrl,
    req.path
  ].join(':');
}

function getRetryAfterSeconds(resetAt: number, now: number): number {
  return Math.max(1, Math.ceil((resetAt - now) / 1000));
}

function setRateLimitHeaders(res: Response, limit: number, remaining: number, resetAt: number, now: number): void {
  res.setHeader('RateLimit-Limit', String(limit));
  res.setHeader('RateLimit-Remaining', String(Math.max(0, remaining)));
  res.setHeader('RateLimit-Reset', String(getRetryAfterSeconds(resetAt, now)));
}

export function rateLimiter(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = getRequestKey(req);
    const now = Date.now();
    const entry = attempts.get(key);

    if (!entry || now > entry.resetAt) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      setRateLimitHeaders(res, max, max - 1, now + windowMs, now);

      return next();
    }

    if (entry.count >= max) {
      setRateLimitHeaders(res, max, 0, entry.resetAt, now);
      res.setHeader('Retry-After', String(getRetryAfterSeconds(entry.resetAt, now)));

      return res.status(429).json({
        error: {
          message: 'Too many requests',
          code: 'RATE_LIMIT'
        }
      });
    }

    entry.count++;
    setRateLimitHeaders(res, max, max - entry.count, entry.resetAt, now);

    return next();
  };
}
