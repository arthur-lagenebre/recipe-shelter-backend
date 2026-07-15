import { PERMISSIONS } from '../../security/permissions.js';

import type { RbacRepository } from './rbac.repository.interface.js';
import type { PermissionCode } from '../../security/permissions.js';
import type { RowDataPacket } from 'mysql2';
import type { Pool } from 'mysql2/promise';

type PermissionCodeRow = RowDataPacket & {
  Code: string;
};

const KNOWN_PERMISSION_CODES = new Set<string>(Object.values(PERMISSIONS));

export class RbacRepositoryMysql implements RbacRepository {
  constructor(private readonly db: Pool) { }

  async findPermissionCodesByStaffUserId(staffUserId: number): Promise<PermissionCode[]> {
    const [rows] = await this.db.execute<PermissionCodeRow[]>(
      `SELECT DISTINCT p.Code
       FROM StaffRoles AS sr
       INNER JOIN RolePermissions AS rp ON rp.RoleId = sr.RoleId
       INNER JOIN Permissions AS p ON p.Id = rp.PermissionId
       WHERE sr.StaffUserId = ?
       ORDER BY p.Code`,
      [staffUserId]
    );

    return rows
      .map((row) => row.Code)
      .filter((code): code is PermissionCode => KNOWN_PERMISSION_CODES.has(code));
  }
}
