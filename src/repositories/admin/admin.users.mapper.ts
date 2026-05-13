import type { BannedUser, BannedUserRow } from './admin.users.types.js';

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
