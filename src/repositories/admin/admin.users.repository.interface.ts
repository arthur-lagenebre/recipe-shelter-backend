import type { BannedUser } from './admin.users.types.js';

export interface AdminUserRepository {
    findBannedForAdmin(): Promise<BannedUser[]>;
    countBannedForAdmin(): Promise<number>;
}
