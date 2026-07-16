import { badRequest } from '../../utils/errors.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseStaffUserIdParam(value: unknown): number {
  const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN;

  if (!Number.isSafeInteger(id) || id <= 0)
    throw badRequest('Staff user ID must be a positive integer', 'STAFF_SESSION_BAD_USER_ID');

  return id;
}

export function parseStaffSessionIdParam(value: unknown): string {
  const sessionId = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (!UUID_PATTERN.test(sessionId))
    throw badRequest('Staff session ID must be a UUID', 'STAFF_SESSION_BAD_ID');

  return sessionId;
}
