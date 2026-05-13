import { badRequest, forbidden, notFound } from '../../utils/errors.js';

import type { AdminUserRepository } from '../../repositories/admin/admin.users.repository.interface.js';
import type { BannedUser } from '../../repositories/admin/admin.users.types.js';
import type { UserRepository } from '../../repositories/users/user.repository.interface.js';

export class AdminUserService {
    constructor(private readonly users: UserRepository, private readonly adminUsers: AdminUserRepository) { }

    async getBannedUsersForAdmin(): Promise<BannedUser[]> {
        return this.adminUsers.findBannedForAdmin();
    }

    async getCountBannedUsersForAdmin(): Promise<number> {
        return this.adminUsers.countBannedForAdmin();
    }

    async ban(userId: number, adminUserId: number, reason: string): Promise<boolean> {
        const cleanReason = reason.trim();

        if (!cleanReason)
            throw badRequest('Ban reason is required', 'ADMIN_USERS_BAN_MISSING_REASON');

        if (cleanReason.length < 10)
            throw badRequest('Ban reason must be at least 10 characters', 'ADMIN_USERS_BAN_REASON_TOO_SHORT');

        if (userId === adminUserId)
            throw forbidden('Admin users cannot ban themselves', 'ADMIN_USERS_BAN_SELF_FORBIDDEN');

        const user = await this.users.findById(userId);

        if (!user)
            throw notFound('User not found', 'USER_NOT_FOUND');

        return this.users.ban(userId, adminUserId, cleanReason);
    }

    async unban(userId: number): Promise<boolean> {
        const user = await this.users.findById(userId);

        if (!user)
            throw notFound('User not found', 'USER_NOT_FOUND');

        return this.users.unban(userId);
    }
}
