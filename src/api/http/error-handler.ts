import type { HttpResponse } from './http.types.js';
import { HttpError } from '../../utils/errors.js';

export function handleHttpError(response: HttpResponse, error: unknown): void {
    if (error instanceof HttpError) {
        response.status(error.status)
                .json({ error: { message: error.message, ...(error.code ? { code: error.code } : {}) } });

        return;
    }

    console.error('[UNHANDLED_ERROR]', error);

    response.status(500)
            .json({ error: { message: 'Internal Server Error', code: 'INTERNAL_SERVER_ERROR' } });
}