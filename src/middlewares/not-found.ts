import type { NextFunction, Request, Response } from 'express';

export function notFound(_req: Request, _res: Response, next: NextFunction) {
    next({
        statusCode: 404,
        message: 'Route not found',
        code: 'ROUTE_NOT_FOUND'
    });
}
