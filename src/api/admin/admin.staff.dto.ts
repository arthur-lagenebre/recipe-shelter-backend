import { badRequest } from '../../utils/errors.js';
import { getRequiredString, isRecord } from '../http/dto.helpers.js';

const ACTION_REASON_MIN_LENGTH = 10;
const ACTION_REASON_MAX_LENGTH = 1000;
const ROLE_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;

type StaffAction = 'disable' | 'enable' | 'role_grant' | 'role_revoke';

export function parseAdminStaffUserIdParam(value: unknown): number {
    const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN;

    if (!Number.isSafeInteger(id) || id <= 0) throw badRequest('Staff user ID must be a positive integer', 'ADMIN_STAFF_BAD_USER_ID');

    return id;
}

export function parseAdminStaffRoleCodeParam(value: unknown): string {
    const roleCode = typeof value === 'string' ? value.trim() : '';

    if (!ROLE_CODE_PATTERN.test(roleCode)) throw badRequest('Staff role code is invalid', 'ADMIN_STAFF_BAD_ROLE_CODE');

    return roleCode;
}

export function parseStaffActionReasonBody(body: unknown, action: StaffAction): string {
    const codePrefix = `STAFF_${action.toUpperCase()}`;
    const label = action
        .split('_')
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join(' ');

    if (!isRecord(body)) throw badRequest('Invalid body', `${codePrefix}_BAD_BODY`);

    const reason = getRequiredString(body.reason, `${label} reason is required`, `${codePrefix}_MISSING_REASON`);

    if (reason.length < ACTION_REASON_MIN_LENGTH)
        throw badRequest(`${label} reason must be at least ${ACTION_REASON_MIN_LENGTH} characters`, `${codePrefix}_REASON_TOO_SHORT`);
    if (reason.length > ACTION_REASON_MAX_LENGTH)
        throw badRequest(`${label} reason must be at most ${ACTION_REASON_MAX_LENGTH} characters`, `${codePrefix}_REASON_TOO_LONG`);

    return reason;
}
