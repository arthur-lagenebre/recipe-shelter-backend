import { ADMIN_AUDIT_EVENT_TYPES, ADMIN_AUDIT_TARGET_TYPES } from './admin-audit.events.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';

import type { AdminAuditActionRunner } from './admin-audit-action.runner.js';
import type { AdminAuditRequestContext } from './admin-audit.service.js';
import type { AdminUserRepository } from '../../repositories/admin/admin.users.repository.interface.js';
import type { AdminUserDetails, BannedUser, UserModerationAction } from '../../repositories/admin/admin.users.types.js';
import type { UserRepository } from '../../repositories/users/user.repository.interface.js';
import type { User } from '../../repositories/users/user.types.js';

const MODERATION_REASON_MIN_LENGTH = 10;
const MODERATION_REASON_MAX_LENGTH = 1000;

export type AdminUserModerationLogDto = {
    id: number;
    action: UserModerationAction;
    reason: string;
    adminId: number;
    adminUsername?: string;
    createdAt: Date;
};

export type AdminUserProfileDto = AdminUserDetails & {
    moderationLogs: AdminUserModerationLogDto[];
};

export class AdminUserService {
    constructor(private readonly users: UserRepository, private readonly adminUsers: AdminUserRepository, private readonly auditActions: AdminAuditActionRunner) { }

    async getBannedUsersForAdmin(): Promise<BannedUser[]> {
        return this.adminUsers.findBannedForAdmin();
    }

    async getCountBannedUsersForAdmin(): Promise<number> {
        return this.adminUsers.countBannedForAdmin();
    }

    async getAdminUserProfile(userId: number): Promise<AdminUserProfileDto> {
        const user = await this.adminUsers.findAdminUserById(userId);

        if (!user)
            throw notFound('User not found', 'USER_NOT_FOUND');

        const moderationLogs = await this.adminUsers.findModerationLogsByUserId(userId);

        return {
            ...user,
            moderationLogs: moderationLogs.map((log) => {
                const dto: AdminUserModerationLogDto = {
                    id: log.id,
                    action: log.action,
                    reason: log.reason,
                    adminId: log.adminId,
                    createdAt: log.createdAt
                };

                if (log.adminUsername)
                    dto.adminUsername = log.adminUsername;

                return dto;
            })
        };
    }

    async ban(userId: number, adminUserId: number, reason: string, context: AdminAuditRequestContext): Promise<boolean> {
        const cleanReason = validateModerationReason(reason, 'ban');

        if (userId === adminUserId)
            throw forbidden('Admin users cannot ban themselves', 'ADMIN_USERS_BAN_SELF_FORBIDDEN');

        return this.auditActions.run(async ({ db, audit }) => {
            const user = await this.users.findById(userId, db);

            if (!user)
                throw notFound('User not found', 'USER_NOT_FOUND');

            if (user.accountType !== 'community')
                throw forbidden('Staff accounts cannot be community-moderated', 'ADMIN_USERS_STAFF_MODERATION_FORBIDDEN');

            const banned = await this.adminUsers.ban(userId, adminUserId, cleanReason, db);

            if (banned)
                await audit.record({
                    actorUserId: adminUserId,
                    eventType: ADMIN_AUDIT_EVENT_TYPES.usersBan,
                    targetType: ADMIN_AUDIT_TARGET_TYPES.communityUser,
                    targetId: userId,
                    reason: cleanReason,
                    beforeValues: snapshotUserModeration(user),
                    afterValues: {
                        ...snapshotUserModeration(user),
                        status: 'banned',
                        bannedByUserId: adminUserId,
                        bannedReason: cleanReason
                    },
                    ...context
                });

            return banned;
        });
    }

    async unban(userId: number, adminUserId: number, reason: string, context: AdminAuditRequestContext): Promise<boolean> {
        const cleanReason = validateModerationReason(reason, 'unban');

        return this.auditActions.run(async ({ db, audit }) => {
            const user = await this.users.findById(userId, db);

            if (!user)
                throw notFound('User not found', 'USER_NOT_FOUND');

            if (user.accountType !== 'community')
                throw forbidden('Staff accounts cannot be community-moderated', 'ADMIN_USERS_STAFF_MODERATION_FORBIDDEN');

            const unbanned = await this.adminUsers.unban(userId, adminUserId, cleanReason, db);

            if (unbanned)
                await audit.record({
                    actorUserId: adminUserId,
                    eventType: ADMIN_AUDIT_EVENT_TYPES.usersUnban,
                    targetType: ADMIN_AUDIT_TARGET_TYPES.communityUser,
                    targetId: userId,
                    reason: cleanReason,
                    beforeValues: snapshotUserModeration(user),
                    afterValues: {
                        ...snapshotUserModeration(user),
                        status: 'active',
                        bannedByUserId: null,
                        bannedReason: null
                    },
                    ...context
                });

            return unbanned;
        });
    }
}

function snapshotUserModeration(user: User) {
    return {
        username: user.username,
        status: user.status,
        bannedByUserId: user.bannedByUserId,
        bannedReason: user.bannedReason
    };
}

function validateModerationReason(reason: string, action: 'ban' | 'unban'): string {
    const cleanReason = reason.trim();
    const label = action === 'ban' ? 'Ban' : 'Unban';
    const codePrefix = action === 'ban' ? 'ADMIN_USERS_BAN' : 'ADMIN_USERS_UNBAN';

    if (!cleanReason)
        throw badRequest(`${label} reason is required`, `${codePrefix}_MISSING_REASON`);

    if (cleanReason.length < MODERATION_REASON_MIN_LENGTH)
        throw badRequest(
            `${label} reason must be at least ${MODERATION_REASON_MIN_LENGTH} characters`,
            `${codePrefix}_REASON_TOO_SHORT`
        );

    if (cleanReason.length > MODERATION_REASON_MAX_LENGTH)
        throw badRequest(
            `${label} reason must be at most ${MODERATION_REASON_MAX_LENGTH} characters`,
            `${codePrefix}_REASON_TOO_LONG`
        );

    return cleanReason;
}
