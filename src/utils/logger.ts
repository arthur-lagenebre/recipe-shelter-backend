export const logger = {
    info: (msg: string, meta?: unknown) => console.log(msg, meta ?? ''),
    warn: (msg: string, meta?: unknown) => console.warn(msg, meta ?? ''),
    error: (msg: string, meta?: unknown) => console.error(msg, meta ?? ''),
    debug: (msg: string, meta?: unknown) => console.debug(msg, meta ?? '')
};
