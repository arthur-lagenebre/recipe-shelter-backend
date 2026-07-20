import { badRequest } from '../../utils/errors.js';
import { getRequiredString, isRecord } from '../http/dto.helpers.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVOCATION_REASON_MIN_LENGTH = 10;
const REVOCATION_REASON_MAX_LENGTH = 1000;

export function parseStaffUserIdParam(value: unknown): number {
    const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN;

    if (!Number.isSafeInteger(id) || id <= 0) throw badRequest('Staff user ID must be a positive integer', 'STAFF_SESSION_BAD_USER_ID');

    return id;
}

export function parseStaffSessionIdParam(value: unknown): string {
    const sessionId = typeof value === 'string' ? value.trim().toLowerCase() : '';

    if (!UUID_PATTERN.test(sessionId)) throw badRequest('Staff session ID must be a UUID', 'STAFF_SESSION_BAD_ID');

    return sessionId;
}

export function parseManagedStaffSessionRevocationBody(body: unknown): string {
    if (!isRecord(body)) throw badRequest('Invalid body', 'STAFF_SESSION_REVOKE_BAD_BODY');

    const reason = getRequiredString(body.reason, 'Session revocation reason is required', 'STAFF_SESSION_REVOKE_MISSING_REASON');

    if (reason.length < REVOCATION_REASON_MIN_LENGTH)
        throw badRequest(
            `Session revocation reason must be at least ${REVOCATION_REASON_MIN_LENGTH} characters`,
            'STAFF_SESSION_REVOKE_REASON_TOO_SHORT'
        );
    if (reason.length > REVOCATION_REASON_MAX_LENGTH)
        throw badRequest(
            `Session revocation reason must be at most ${REVOCATION_REASON_MAX_LENGTH} characters`,
            'STAFF_SESSION_REVOKE_REASON_TOO_LONG'
        );

    return reason;
}
