import type { UserStatus } from '../../repositories/users/user.types.js';

export type AuthContext = {
    userId: number;
    username: string;
    roleId: number;
    status: UserStatus;
};
