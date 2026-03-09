import { env } from '../../utils/env.js';
import type { HttpResponse } from './http.types.js';

function parseAllowedOrigins(value: string): string[] {
    return value.split(',')
                .map((origin) => origin.trim())
                .filter(Boolean);
}

const allowedOrigins = parseAllowedOrigins(env.http.corsAllowedOrigins);

export function applyCors(origin: string | undefined, response: HttpResponse): void {
    if (!origin)
        return;

    if (allowedOrigins.includes(origin)) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
        response.setHeader('Access-Control-Allow-Credentials', 'true');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
}

export function handlePreflight(method: string, response: HttpResponse): boolean {
    if (method !== 'OPTIONS')
        return false;

    response.status(204).send();
    
    return true;
}