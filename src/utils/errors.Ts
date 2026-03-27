export class HttpError extends Error {
    constructor(public readonly status: number, message: string, public readonly code?: string) {
        super(message);
        this.name = 'HttpError';
    }

    get statusCode(): number {
        return this.status;
    }
}

export const badRequest = (message: string, code?: string) => new HttpError(400, message, code);
export const unauthorized = (message = 'Unauthorized', code?: string) => new HttpError(401, message, code);
export const forbidden = (message = 'Forbidden', code?: string) => new HttpError(403, message, code);
export const notFound = (message = 'Not found', code?: string) => new HttpError(404, message, code);
export const conflict = (message = 'Conflict', code?: string) => new HttpError(409, message, code);
