export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type HttpRequest = {
    method: HttpMethod;
    url: URL;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
    auth?: { userId: number; roleId: number };
};

export type HttpResponse = {
    status(code: number): HttpResponse;
    json(payload: unknown): void;
};

export type Next = (err?: unknown) => void;
export type Handler = (req: HttpRequest, res: HttpResponse, next: Next) => void | Promise<void>;