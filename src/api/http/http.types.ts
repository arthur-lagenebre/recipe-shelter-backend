import type { AuthContext } from '../../types/auth.types.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

export type HttpRequest = {
    method: HttpMethod;
    url: URL;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
    auth?: AuthContext;
};

export type HttpResponse = {
    setHeader(name: string, value: string): HttpResponse;
    status(code: number): HttpResponse;
    json(payload: unknown): void;
    send(payload?: string): void;
};

export type Next = (err?: unknown) => void;
export type Handler = (req: HttpRequest, res: HttpResponse, next: Next) => void | Promise<void>;