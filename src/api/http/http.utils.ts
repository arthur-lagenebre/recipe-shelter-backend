import type { IncomingMessage, ServerResponse } from 'node:http';
import { badRequest } from '../../utils/errors.js';

export function makeRes(res: ServerResponse) {
    return {
        status(code: number) {
            res.statusCode = code;

            return this;
        },
        json(payload: unknown) {
            if (!res.headersSent)
                res.setHeader('Content-Type', 'application/json; charset=utf-8');

            res.end(JSON.stringify(payload));
        },
    };
}

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
    const contentType = req.headers['content-type'] ?? '';
    
    if (!String(contentType).includes('application/json'))
        return undefined;

    const chunks: Buffer[] = [];

    for await (const chunk of req) chunks.push(Buffer.from(chunk));

    const raw = Buffer.concat(chunks).toString('utf8').trim();

    if (!raw)
        return undefined;

    try {
        return JSON.parse(raw);
    } catch {
        throw badRequest('Invalid JSON body', 'BAD_JSON');
    }
}