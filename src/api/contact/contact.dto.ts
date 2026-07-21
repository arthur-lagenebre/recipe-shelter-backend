import { badRequest } from '../../utils/errors.js';

export type ContactMessageDto = {
    name: string;
    email: string;
    subject: string;
    message: string;
    isSuspectedBot: boolean;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HONEYPOT_FIELD = 'company';
const MIN_SUBMIT_DELAY_MS = 3000;

function asObject(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function getRequiredString(obj: Record<string, unknown>, field: keyof ContactMessageDto): string {
    const value = obj[field];

    if (typeof value !== 'string')
        throw badRequest('Missing fields', 'CONTACT_MISSING_FIELDS');

    const trimmedValue = value.trim();

    if (!trimmedValue)
        throw badRequest('Missing fields', 'CONTACT_MISSING_FIELDS');

    return trimmedValue;
}

function ensureLength(value: string, field: string, min: number, max: number): void {
    if (value.length < min)
        throw badRequest(`${field} is too short`, `CONTACT_${field.toUpperCase()}_TOO_SHORT`);

    if (value.length > max)
        throw badRequest(`${field} is too long`, `CONTACT_${field.toUpperCase()}_TOO_LONG`);
}

export function parseContactMessageBody(body: unknown): ContactMessageDto {
    const obj = asObject(body);
    const name = getRequiredString(obj, 'name');
    const email = getRequiredString(obj, 'email');
    const subject = getRequiredString(obj, 'subject');
    const message = getRequiredString(obj, 'message');

    ensureLength(name, 'name', 2, 100);
    ensureLength(email, 'email', 1, 255);
    ensureLength(subject, 'subject', 3, 150);
    ensureLength(message, 'message', 10, 5000);

    if (!EMAIL_PATTERN.test(email))
        throw badRequest('Invalid email', 'CONTACT_INVALID_EMAIL');

    const honeypotValue = typeof obj[HONEYPOT_FIELD] === 'string' ? (obj[HONEYPOT_FIELD] as string).trim() : '';
    const honeypotTriggered = honeypotValue.length > 0;

    const renderedAtRaw = obj.formRenderedAt;
    const renderedAtMs = typeof renderedAtRaw === 'string' ? Date.parse(renderedAtRaw) : NaN;
    const elapsedMs = Number.isFinite(renderedAtMs) ? Date.now() - renderedAtMs : NaN;
    const timingSuspicious = !Number.isFinite(elapsedMs) || elapsedMs < MIN_SUBMIT_DELAY_MS || elapsedMs < 0;

    const isSuspectedBot = honeypotTriggered || timingSuspicious;

    return { name, email, subject, message, isSuspectedBot };
}
