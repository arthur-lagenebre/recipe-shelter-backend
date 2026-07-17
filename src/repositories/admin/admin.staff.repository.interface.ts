import type { AdminStaffAccount, AdminStaffRole } from './admin.staff.types.js';
import type { PoolConnection } from 'mysql2/promise';

export interface AdminStaffRepository {
  findAll(db?: PoolConnection): Promise<AdminStaffAccount[]>;
  findById(staffUserId: number, db?: PoolConnection): Promise<AdminStaffAccount | null>;
  findRoleByCode(roleCode: string, db?: PoolConnection): Promise<AdminStaffRole | null>;
  disable(staffUserId: number, actorStaffUserId: number, reason: string, db: PoolConnection): Promise<number | null>;
  enable(staffUserId: number, db: PoolConnection): Promise<boolean>;
  grantRole(staffUserId: number, roleId: number, db: PoolConnection): Promise<boolean>;
  revokeRole(staffUserId: number, roleId: number, db: PoolConnection): Promise<boolean>;
}
