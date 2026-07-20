import { assertStaffStatus } from '../users/user.types.js';

import type { AdminStaffAccount, AdminStaffAccountRow, AdminStaffRole, AdminStaffRoleRow } from './admin.staff.types.js';

export function mapAdminStaffRole(row: AdminStaffRoleRow): AdminStaffRole {
    return {
        id: Number(row.Id),
        code: row.Code,
        name: row.Name
    };
}

export function mapAdminStaffAccount(row: AdminStaffAccountRow, roles: AdminStaffRole[]): AdminStaffAccount {
    assertStaffStatus(row.Status);

    return {
        id: Number(row.Id),
        email: row.Email,
        displayName: row.DisplayName,
        status: row.Status,
        mfaEnrolledAt: row.MfaEnrolledAt,
        disabledByStaffUserId: row.DisabledByStaffUserId === null ? null : Number(row.DisabledByStaffUserId),
        disabledByDisplayName: row.DisabledByDisplayName,
        disabledReason: row.DisabledReason,
        disabledAt: row.DisabledAt,
        activeSessionCount: Number(row.ActiveSessionCount),
        roles,
        createdAt: row.CreatedAt,
        updatedAt: row.UpdatedAt
    };
}
