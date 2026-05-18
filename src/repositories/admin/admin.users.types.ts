import type { UserStatus } from '../users/user.types.js';
import type { RowDataPacket } from 'mysql2';

export type BannedUser = {
    id: number;
    username: string;
    mail: string;
    status: UserStatus;
    bannedAt: Date | null;
    bannedReason: string | null;
    bannedByUsername: string | null;
};

export type BannedUserRow = RowDataPacket & {
    Id: number;
    Username: string;
    Mail: string;
    Status: UserStatus;
    BannedAt: Date | null;
    BannedReason: string | null;
    BannedByUsername: string | null;
};

export type UserModerationAction = 'ban' | 'unban';

export type AdminUserDetails = {
    id: number;
    username: string;
    email: string;
    status: UserStatus;
    banReason: string | null;
    bannedAt: Date | null;
    bannedByUserId: number | null;
    createdAt: Date;
    updatedAt: Date;
};

export type AdminUserDetailsRow = RowDataPacket & {
    Id: number;
    Username: string;
    Mail: string;
    Status: UserStatus;
    BannedReason: string | null;
    BannedAt: Date | null;
    BannedByUserId: number | null;
    CreatedAt: Date;
    UpdatedAt: Date;
};

export type UserModerationLog = {
    id: number;
    userId: number;
    adminId: number;
    action: UserModerationAction;
    reason: string;
    adminUsername?: string;
    createdAt: Date;
};

export type UserModerationLogRow = RowDataPacket & {
    Id: number;
    UserId: number;
    AdminId: number;
    Action: UserModerationAction;
    Reason: string;
    AdminUsername: string | null;
    CreatedAt: Date;
};

export type CreateUserModerationLogInput = {
    userId: number;
    adminId: number;
    action: UserModerationAction;
    reason: string;
};
