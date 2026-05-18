import type { AdminUserDetails, BannedUser, UserModerationLog } from './admin.users.types.js';

export interface AdminUserRepository {
    findBannedForAdmin(): Promise<BannedUser[]>;
    countBannedForAdmin(): Promise<number>;
    findAdminUserById(userId: number): Promise<AdminUserDetails | null>;
    findModerationLogsByUserId(userId: number): Promise<UserModerationLog[]>;
    ban(userId: number, adminUserId: number, reason: string): Promise<boolean>;
    unban(userId: number, adminUserId: number, reason: string): Promise<boolean>;
}
