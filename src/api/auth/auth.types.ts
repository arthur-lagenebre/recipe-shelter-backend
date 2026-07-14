import type { AccountType, UserStatus } from '../../repositories/users/user.types.js';

export type AuthContext = {
    userId: number;
    username: string;
    roleId: number;
    accountType: AccountType;
    status: UserStatus;
};
