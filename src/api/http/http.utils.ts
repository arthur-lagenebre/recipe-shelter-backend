import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HttpResponse } from './http.types.js';
import { HttpError } from '../../utils/errors.js';

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];

    for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    if (chunks.length === 0)
        return undefined;

    const rawBody = Buffer.concat(chunks).toString('utf-8').trim();

    if (!rawBody)
        return undefined;

    try {
        return JSON.parse(rawBody);
    } catch {
        throw new HttpError(400, 'Invalid JSON body', 'INVALID_JSON_BODY');
    }
}

export function makeRes(response: ServerResponse): HttpResponse {
    let statusCode = 200;

    return {
        setHeader(name: string, value: string): HttpResponse {
            response.setHeader(name, value);
            return this;
        },
        status(code: number): HttpResponse {
            statusCode = code;
            return this;
        },
        json(payload: unknown): void {
            response.statusCode = statusCode;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify(payload));
        },
        send(payload = ''): void {
            response.statusCode = statusCode;
            response.end(payload);
        }
    };
}