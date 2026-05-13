import { mapBannedUser } from './admin.users.mapper.js';
import { firstOrNull } from '../../utils/array.js';

import type { AdminUserRepository } from './admin.users.repository.interface.js';
import type { BannedUser, BannedUserRow } from './admin.users.types.js';
import type { Pool } from 'mysql2/promise';

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
}
