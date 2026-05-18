import { mapAdminUserDetails, mapBannedUser, mapUserModerationLog } from './admin.users.mapper.js';
import { firstOrNull } from '../../utils/array.js';

import type { AdminUserRepository } from './admin.users.repository.interface.js';
import type {
    AdminUserDetails,
    AdminUserDetailsRow,
    BannedUser,
    BannedUserRow,
    CreateUserModerationLogInput,
    UserModerationAction,
    UserModerationLog,
    UserModerationLogRow
} from './admin.users.types.js';
import type { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';

const USER_MODERATION_LOGS_LIMIT = 50;

export class AdminUserRepositoryMysql implements AdminUserRepository {
    constructor(private readonly db: Pool) { }

    async findBannedForAdmin(): Promise<BannedUser[]> {
        const [rows] = await this.db.execute(
            `SELECT u.Id, u.Username, u.Mail, u.Status, u.BannedAt, u.BannedReason, bannedBy.Username AS BannedByUsername
             FROM Users AS u
             LEFT JOIN Users AS bannedBy ON u.BannedByUserId = bannedBy.Id
             WHERE u.Status = 'banned'
             ORDER BY u.BannedAt DESC, u.Id DESC`
        );

        return (rows as BannedUserRow[]).map(mapBannedUser);
    }

    async countBannedForAdmin(): Promise<number> {
        const [rows] = await this.db.execute(
            `SELECT COUNT(*) AS Count
             FROM Users
             WHERE Status = 'banned'`
        );

        const row = firstOrNull(rows as { Count: number }[]);
        return row?.Count ?? 0;
    }

    async findAdminUserById(userId: number): Promise<AdminUserDetails | null> {
        const [rows] = await this.db.execute(
            `SELECT Id, Username, Mail, Status, BannedReason, BannedAt, BannedByUserId, CreatedAt, UpdatedAt
             FROM Users
             WHERE Id = ?`,
            [userId]
        );

        const row = firstOrNull(rows as AdminUserDetailsRow[]);
        return row ? mapAdminUserDetails(row) : null;
    }

    async findModerationLogsByUserId(userId: number): Promise<UserModerationLog[]> {
        const [rows] = await this.db.execute(
            `SELECT l.Id, l.UserId, l.AdminId, l.Action, l.Reason, admin.Username AS AdminUsername, l.CreatedAt
             FROM UserModerationLogs AS l
             LEFT JOIN Users AS admin ON l.AdminId = admin.Id
             WHERE l.UserId = ?
             ORDER BY l.CreatedAt DESC, l.Id DESC
             LIMIT ${USER_MODERATION_LOGS_LIMIT}`,
            [userId]
        );

        return (rows as UserModerationLogRow[]).map(mapUserModerationLog);
    }

    async ban(userId: number, adminUserId: number, reason: string): Promise<boolean> {
        return this.updateUserWithModerationLog('ban', userId, adminUserId, reason, async (conn) => {
            const [result] = await conn.execute<ResultSetHeader>(
                `UPDATE Users
                 SET Status = 'banned',
                     BannedByUserId = ?,
                     BannedReason = ?,
                     BannedAt = CURRENT_TIMESTAMP
                 WHERE Id = ?`,
                [adminUserId, reason, userId]
            );

            return result.affectedRows > 0;
        });
    }

    async unban(userId: number, adminUserId: number, reason: string): Promise<boolean> {
        return this.updateUserWithModerationLog('unban', userId, adminUserId, reason, async (conn) => {
            const [result] = await conn.execute<ResultSetHeader>(
                `UPDATE Users
                 SET Status = 'active',
                     BannedByUserId = NULL,
                     BannedReason = NULL,
                     BannedAt = NULL
                 WHERE Id = ?`,
                [userId]
            );

            return result.affectedRows > 0;
        });
    }

    private async updateUserWithModerationLog(
        action: UserModerationAction,
        userId: number,
        adminUserId: number,
        reason: string,
        updateUser: (conn: PoolConnection) => Promise<boolean>
    ): Promise<boolean> {
        const conn = await this.db.getConnection();

        try {
            await conn.beginTransaction();

            const updated = await updateUser(conn);

            if (updated)
                await this.createModerationLog(conn, { userId, adminId: adminUserId, action, reason });

            await conn.commit();

            return updated;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    private async createModerationLog(conn: PoolConnection, input: CreateUserModerationLogInput): Promise<void> {
        await conn.execute(
            `INSERT INTO UserModerationLogs (UserId, AdminId, Action, Reason)
             VALUES (?, ?, ?, ?)`,
            [input.userId, input.adminId, input.action, input.reason]
        );
    }
}
