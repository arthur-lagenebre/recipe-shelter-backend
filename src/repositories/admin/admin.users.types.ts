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
