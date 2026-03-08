import { badRequest } from '../../utils/errors.js';

export function parseRegisterBody(body: any): { mail: string; username: string; password: string } {
    const mail = String(body?.mail ?? '');
    const username = String(body?.username ?? '');
    const password = String(body?.password ?? '');

    if (!mail || !username || !password)
        throw badRequest('Missing fields', 'AUTH_MISSING_FIELDS');

    return { mail, username, password };
}

export function parseLoginBody(body: any): { mail: string; password: string } {
    const mail = String(body?.mail ?? '');
    const password = String(body?.password ?? '');

    if (!mail || !password)
        throw badRequest('Missing fields', 'AUTH_MISSING_FIELDS');

    return { mail, password };
}