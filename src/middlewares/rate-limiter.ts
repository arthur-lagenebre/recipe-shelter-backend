import type { NextFunction, Request, Response } from 'express';

const attempts = new Map<string, { count: number; resetAt: number }>();

export function rateLimiter(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const entry = attempts.get(key);

    if (!entry || now > entry.resetAt) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });

      return next();
    }

    if (entry.count >= max) {
      return res.status(429).json({
        error: {
          message: 'Too many requests',
          code: 'RATE_LIMIT'
        }
      });
    }

    entry.count++;

    return next();
  };
}
