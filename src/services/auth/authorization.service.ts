import type { AuthContext } from '../../api/auth/auth.types.js';
import type { PermissionCode } from '../../security/permissions.js';

function hasActiveAccountType(auth: Readonly<AuthContext> | null | undefined, accountType: AuthContext['accountType']): boolean {
  return auth?.accountType === accountType && auth.status === 'active';
}

export function hasPermission(auth: Readonly<AuthContext> | null | undefined, permission: PermissionCode): boolean {
  return isStaffAccount(auth) && auth?.permissions.includes(permission) === true;
}

export function isCommunityAccount(auth: Readonly<AuthContext> | null | undefined): boolean {
  return hasActiveAccountType(auth, 'community');
}

export function isStaffAccount(auth: Readonly<AuthContext> | null | undefined): boolean {
  return hasActiveAccountType(auth, 'staff');
}
