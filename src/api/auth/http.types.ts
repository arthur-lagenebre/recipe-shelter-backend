export type NextFunction = (err?: unknown) => void;

export type Request = {
    body: unknown;
    header(name: string): string | undefined;
};

export type Response = {
    status(code: number): Response;
    json(payload: unknown): void;
};