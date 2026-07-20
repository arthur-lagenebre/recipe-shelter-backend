import type { AdminUserDetails, BannedUser, UserModerationLog } from './admin.users.types.js';
import type { PoolConnection } from 'mysql2/promise';

export interface AdminUserRepository {
    findBannedForAdmin(): Promise<BannedUser[]>;
    countBannedForAdmin(): Promise<number>;
    findAdminUserById(userId: number): Promise<AdminUserDetails | null>;
    findModerationLogsByUserId(userId: number): Promise<UserModerationLog[]>;
    ban(userId: number, adminUserId: number, reason: string, db?: PoolConnection): Promise<boolean>;
    unban(userId: number, adminUserId: number, reason: string, db?: PoolConnection): Promise<boolean>;
    createModerationLog(auditLogId: number, userId: number, db: PoolConnection): Promise<void>;
}
