import { logger } from '../utils/logger.js';

import type { NextFunction, Request, Response } from 'express';

type AppError = {
    status?: number;
    statusCode?: number;
    message?: string;
    code?: string;
};

export function errorHandler(err: AppError, _req: Request, res: Response, _next: NextFunction) {
    const statusCode = err.statusCode ?? err.status ?? 500;

    if (statusCode >= 500)
        logger.error('[http] Internal error', err);

    res.status(statusCode).json({
        error: {
            message: err.message ?? 'Internal server error',
            code: err.code ?? 'INTERNAL_ERROR'
        }
    });
}
