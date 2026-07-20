import { mapAdminUserDetails, mapBannedUser, mapUserModerationLog } from './admin.users.mapper.js';
import { firstOrNull } from '../../utils/array.js';

import type { AdminUserRepository } from './admin.users.repository.interface.js';
import type {
    AdminUserDetails,
    AdminUserDetailsRow,
    BannedUser,
    BannedUserRow,
    UserModerationLog,
    UserModerationLogRow
} from './admin.users.types.js';
import type { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';

const USER_MODERATION_LOGS_LIMIT = 50;

export class AdminUserRepositoryMysql implements AdminUserRepository {
    constructor(private readonly db: Pool) {}

    async findBannedForAdmin(): Promise<BannedUser[]> {
        const [rows] = await this.db.execute(
            `SELECT u.Id, u.Username, u.Mail, cp.Status, cp.BannedAt, cp.BannedReason, bannedBy.Username AS BannedByUsername
             FROM Users AS u
             INNER JOIN CommunityProfiles AS cp ON cp.UserId = u.Id
             LEFT JOIN Users AS bannedBy ON cp.BannedByUserId = bannedBy.Id
             WHERE cp.Status = 'banned'
             ORDER BY cp.BannedAt DESC, u.Id DESC`
        );

        return (rows as BannedUserRow[]).map(mapBannedUser);
    }

    async countBannedForAdmin(): Promise<number> {
        const [rows] = await this.db.execute(
            `SELECT COUNT(*) AS Count
             FROM CommunityProfiles
             WHERE Status = 'banned'`
        );

        const row = firstOrNull(rows as { Count: number }[]);
        return row?.Count ?? 0;
    }

    async findAdminUserById(userId: number): Promise<AdminUserDetails | null> {
        const [rows] = await this.db.execute(
            `SELECT u.Id, u.Username, u.Mail, COALESCE(cp.Status, sp.Status) AS Status,
                    cp.BannedReason, cp.BannedAt, cp.BannedByUserId, u.CreatedAt, u.UpdatedAt
             FROM Users AS u
             LEFT JOIN CommunityProfiles AS cp ON cp.UserId = u.Id
             LEFT JOIN StaffProfiles AS sp ON sp.UserId = u.Id
             WHERE u.Id = ?`,
            [userId]
        );

        const row = firstOrNull(rows as AdminUserDetailsRow[]);
        return row ? mapAdminUserDetails(row) : null;
    }

    async findModerationLogsByUserId(userId: number): Promise<UserModerationLog[]> {
        const [rows] = await this.db.execute(
            `SELECT audit.Id, l.UserId, audit.ActorUserId AS AdminId,
                    CASE audit.Action
                      WHEN 'users.ban' THEN 'ban'
                      WHEN 'users.unban' THEN 'unban'
                    END AS Action,
                    audit.Reason, admin.Username AS AdminUsername,
                    audit.CorrelationId, audit.CreatedAt
             FROM UserModerationLogs AS l
             INNER JOIN AdminAuditLogs AS audit ON audit.Id = l.AdminAuditLogId
             INNER JOIN Users AS admin ON admin.Id = audit.ActorUserId
             WHERE l.UserId = ?
             ORDER BY audit.CreatedAt DESC, audit.Id DESC
             LIMIT ${USER_MODERATION_LOGS_LIMIT}`,
            [userId]
        );

        return (rows as UserModerationLogRow[]).map(mapUserModerationLog);
    }

    async ban(userId: number, adminUserId: number, reason: string, db?: PoolConnection): Promise<boolean> {
        return this.updateUserTransaction(async (conn) => {
            const [result] = await conn.execute<ResultSetHeader>(
                `UPDATE CommunityProfiles
                 SET Status = 'banned',
                     BannedByUserId = ?,
                     BannedReason = ?,
                     BannedAt = CURRENT_TIMESTAMP
                 WHERE UserId = ?`,
                [adminUserId, reason, userId]
            );

            if (result.affectedRows > 0) {
                await conn.execute(
                    `UPDATE Users
                     SET Status = 'banned', BannedByUserId = ?, BannedReason = ?, BannedAt = CURRENT_TIMESTAMP
                     WHERE Id = ? AND AccountType = 'community'`,
                    [adminUserId, reason, userId]
                );
            }

            return result.affectedRows > 0;
        }, db);
    }

    async unban(userId: number, adminUserId: number, reason: string, db?: PoolConnection): Promise<boolean> {
        return this.updateUserTransaction(async (conn) => {
            const [result] = await conn.execute<ResultSetHeader>(
                `UPDATE CommunityProfiles
                 SET Status = 'active',
                     BannedByUserId = NULL,
                     BannedReason = NULL,
                     BannedAt = NULL
                 WHERE UserId = ?`,
                [userId]
            );

            if (result.affectedRows > 0) {
                await conn.execute(
                    `UPDATE Users
                     SET Status = 'active', BannedByUserId = NULL, BannedReason = NULL, BannedAt = NULL
                     WHERE Id = ? AND AccountType = 'community'`,
                    [userId]
                );
            }

            return result.affectedRows > 0;
        }, db);
    }

    async createModerationLog(auditLogId: number, userId: number, db: PoolConnection): Promise<void> {
        const [result] = await db.execute<ResultSetHeader>(
            `INSERT INTO UserModerationLogs (AdminAuditLogId, UserId)
             SELECT audit.Id, ?
             FROM AdminAuditLogs AS audit
             WHERE audit.Id = ?
               AND audit.Action IN ('users.ban', 'users.unban')
               AND audit.TargetType = 'community_user'
               AND audit.Reason IS NOT NULL
               AND BINARY audit.TargetId = BINARY CAST(? AS CHAR)`,
            [userId, auditLogId, userId]
        );

        if (result.affectedRows !== 1) throw new Error('User moderation log does not match its administrative audit entry');
    }

    private async updateUserTransaction(updateUser: (conn: PoolConnection) => Promise<boolean>, db?: PoolConnection): Promise<boolean> {
        if (db) return updateUser(db);

        const conn = await this.db.getConnection();

        try {
            await conn.beginTransaction();

            const updated = await updateUser(conn);

            await conn.commit();

            return updated;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }
}
