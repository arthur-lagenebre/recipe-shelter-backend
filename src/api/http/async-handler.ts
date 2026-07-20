import type { Handler } from './http.types.js';

export function asyncHandler(fn: Handler): Handler {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
