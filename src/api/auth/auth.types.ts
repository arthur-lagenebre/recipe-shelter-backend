import type { AccountType, UserStatus } from '../../repositories/users/user.types.js';
import type { PermissionCode } from '../../security/permissions.js';

export type AuthContext = {
    userId: number;
    username: string;
    accountType: AccountType;
    status: UserStatus;
    permissions: PermissionCode[];
};
