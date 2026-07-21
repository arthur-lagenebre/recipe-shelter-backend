import type {
    AdminUserDetails,
    AdminUserDetailsRow,
    BannedUser,
    BannedUserRow,
    UserModerationLog,
    UserModerationLogRow
} from './admin.users.types.js';

export function mapBannedUser(row: BannedUserRow): BannedUser {
    return {
        id: row.Id,
        username: row.Username,
        mail: row.Mail,
        status: row.Status,
        bannedAt: row.BannedAt,
        bannedReason: row.BannedReason,
        bannedByUsername: row.BannedByUsername
    };
}

export function mapAdminUserDetails(row: AdminUserDetailsRow): AdminUserDetails {
    return {
        id: row.Id,
        username: row.Username,
        email: row.Mail,
        status: row.Status,
        banReason: row.BannedReason,
        bannedAt: row.BannedAt,
        bannedByUserId: row.BannedByUserId,
        createdAt: row.CreatedAt,
        updatedAt: row.UpdatedAt
    };
}

export function mapUserModerationLog(row: UserModerationLogRow): UserModerationLog {
    const log: UserModerationLog = {
        id: row.Id,
        userId: row.UserId,
        adminId: row.AdminId,
        action: row.Action,
        reason: row.Reason,
        correlationId: row.CorrelationId,
        createdAt: row.CreatedAt
    };

    if (row.AdminUsername)
        log.adminUsername = row.AdminUsername;

    return log;
}
