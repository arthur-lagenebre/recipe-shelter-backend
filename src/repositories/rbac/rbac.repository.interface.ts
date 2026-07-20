import type { PermissionCode } from '../../security/permissions.js';

export interface RbacRepository {
    findPermissionCodesByStaffUserId(staffUserId: number): Promise<PermissionCode[]>;
}
