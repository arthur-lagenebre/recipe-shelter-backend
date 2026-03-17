import type { NextFunction, Request, Response } from 'express';

type AppError = {
    statusCode?: number;
    message?: string;
    code?: string;
};

export function errorHandler(err: AppError, _req: Request, res: Response, _next: NextFunction) {
    const statusCode = err.statusCode ?? 500;
    const message = err.message ?? 'Internal server error';
    const code = err.code ?? 'INTERNAL_ERROR';

    res.status(statusCode).json({
        error: {
            message,
            code,
        },
    });
}