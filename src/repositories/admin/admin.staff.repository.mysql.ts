import { mapAdminStaffAccount, mapAdminStaffRole } from './admin.staff.mapper.js';
import { firstOrNull } from '../../utils/array.js';

import type { AdminStaffRepository } from './admin.staff.repository.interface.js';
import type { ActiveSuperAdminRow, AdminStaffAccount, AdminStaffAccountRow, AdminStaffRole, AdminStaffRoleRow, SuperAdminRoleIdRow } from './admin.staff.types.js';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

const SUPER_ADMIN_ROLE_CODE = 'SuperAdmin';

type ActiveSessionCountRow = RowDataPacket & {
  ActiveSessionCount: number | string;
};

const STAFF_ACCOUNT_SELECT = `u.Id,
                              u.Mail AS Email,
                              u.Username AS DisplayName,
                              sp.Status,
                              sp.MfaEnrolledAt,
                              sp.DisabledByStaffUserId,
                              disabledBy.Username AS DisabledByDisplayName,
                              sp.DisabledReason,
                              sp.DisabledAt,
                              (SELECT COUNT(*)
                               FROM StaffSessions AS session
                               WHERE session.StaffUserId = u.Id
                                 AND session.RevokedAt IS NULL
                                 AND session.ExpiresAt > CURRENT_TIMESTAMP) AS ActiveSessionCount,
                              sp.CreatedAt,
                              sp.UpdatedAt`;

export class AdminStaffRepositoryMysql implements AdminStaffRepository {
  constructor(private readonly db: Pool) { }

  async findAll(db?: PoolConnection): Promise<AdminStaffAccount[]> {
    const executor = db ?? this.db;
    const [rows] = await executor.execute<AdminStaffAccountRow[]>(
      `SELECT ${STAFF_ACCOUNT_SELECT}
       FROM StaffProfiles AS sp
       INNER JOIN Users AS u ON u.Id = sp.UserId
       LEFT JOIN Users AS disabledBy ON disabledBy.Id = sp.DisabledByStaffUserId
       ORDER BY sp.CreatedAt DESC, u.Id DESC`
    );
    const rolesByStaffUserId = await this.findRolesByStaffUserIds(rows.map((row) => Number(row.Id)), executor);

    return rows.map((row) => mapAdminStaffAccount(row, rolesByStaffUserId.get(Number(row.Id)) ?? []));
  }

  async findById(staffUserId: number, db?: PoolConnection): Promise<AdminStaffAccount | null> {
    const executor = db ?? this.db;
    const [rows] = await executor.execute<AdminStaffAccountRow[]>(
      `SELECT ${STAFF_ACCOUNT_SELECT}
       FROM StaffProfiles AS sp
       INNER JOIN Users AS u ON u.Id = sp.UserId
       LEFT JOIN Users AS disabledBy ON disabledBy.Id = sp.DisabledByStaffUserId
       WHERE sp.UserId = ?
       ${db ? 'FOR UPDATE' : ''}`,
      [staffUserId]
    );
    const row = firstOrNull(rows);

    if (!row)
      return null;

    const rolesByStaffUserId = await this.findRolesByStaffUserIds([staffUserId], executor);
    return mapAdminStaffAccount(row, rolesByStaffUserId.get(staffUserId) ?? []);
  }

  async findRoleByCode(roleCode: string, db?: PoolConnection): Promise<AdminStaffRole | null> {
    const [rows] = await (db ?? this.db).execute<AdminStaffRoleRow[]>(
      `SELECT 0 AS StaffUserId, Id, Code, Name
       FROM Roles
       WHERE Code = ?`,
      [roleCode]
    );
    const row = firstOrNull(rows);

    return row ? mapAdminStaffRole(row) : null;
  }

  async lockAndCheckLastActiveSuperAdmin(staffUserId: number, db: PoolConnection): Promise<boolean> {
    const [roleRows] = await db.execute<SuperAdminRoleIdRow[]>(
      `SELECT Id
       FROM Roles
       WHERE Code = ?
       FOR UPDATE`,
      [SUPER_ADMIN_ROLE_CODE]
    );
    const role = firstOrNull(roleRows);

    if (!role)
      return false;

    const [activeSuperAdmins] = await db.execute<ActiveSuperAdminRow[]>(
      `SELECT sr.StaffUserId
       FROM StaffRoles AS sr
       INNER JOIN StaffProfiles AS sp ON sp.UserId = sr.StaffUserId
       WHERE sr.RoleId = ? AND sp.Status = 'active'
       ORDER BY sr.StaffUserId
       FOR UPDATE`,
      [role.Id]
    );

    return activeSuperAdmins.length === 1
      && Number(activeSuperAdmins[0]?.StaffUserId) === staffUserId;
  }

  async disable(staffUserId: number, actorStaffUserId: number, reason: string, db: PoolConnection): Promise<number | null> {
    const [sessionCountRows] = await db.execute<ActiveSessionCountRow[]>(
      `SELECT COUNT(*) AS ActiveSessionCount
       FROM StaffSessions
       WHERE StaffUserId = ?
         AND RevokedAt IS NULL
         AND ExpiresAt > CURRENT_TIMESTAMP`,
      [staffUserId]
    );
    const activeSessionCount = Number(sessionCountRows[0]?.ActiveSessionCount ?? 0);
    const [profileResult] = await db.execute<ResultSetHeader>(
      `UPDATE StaffProfiles
       SET Status = 'disabled',
           DisabledByStaffUserId = ?,
           DisabledReason = ?,
           DisabledAt = CURRENT_TIMESTAMP
       WHERE UserId = ? AND Status = 'active'`,
      [actorStaffUserId, reason, staffUserId]
    );

    if (profileResult.affectedRows === 0)
      return null;

    await db.execute(
      `INSERT INTO StaffModerationLogs (StaffUserId, AdminId, Action, Reason)
       VALUES (?, ?, 'disable', ?)`,
      [staffUserId, actorStaffUserId, reason]
    );

    return activeSessionCount;
  }

  async enable(staffUserId: number, db: PoolConnection): Promise<boolean> {
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE StaffProfiles
       SET Status = 'active',
           DisabledByStaffUserId = NULL,
           DisabledReason = NULL,
           DisabledAt = NULL
       WHERE UserId = ? AND Status = 'disabled'`,
      [staffUserId]
    );

    return result.affectedRows > 0;
  }

  async grantRole(staffUserId: number, roleId: number, db: PoolConnection): Promise<boolean> {
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO StaffRoles (StaffUserId, RoleId)
       VALUES (?, ?)`,
      [staffUserId, roleId]
    );

    return result.affectedRows > 0;
  }

  async revokeRole(staffUserId: number, roleId: number, db: PoolConnection): Promise<boolean> {
    const [result] = await db.execute<ResultSetHeader>(
      `DELETE FROM StaffRoles
       WHERE StaffUserId = ? AND RoleId = ?`,
      [staffUserId, roleId]
    );

    return result.affectedRows > 0;
  }

  private async findRolesByStaffUserIds(
    staffUserIds: number[],
    db: Pool | PoolConnection
  ): Promise<Map<number, AdminStaffRole[]>> {
    const rolesByStaffUserId = new Map<number, AdminStaffRole[]>();

    if (staffUserIds.length === 0)
      return rolesByStaffUserId;

    const placeholders = staffUserIds.map(() => '?').join(', ');
    const [rows] = await db.execute<AdminStaffRoleRow[]>(
      `SELECT sr.StaffUserId, r.Id, r.Code, r.Name
       FROM StaffRoles AS sr
       INNER JOIN Roles AS r ON r.Id = sr.RoleId
       WHERE sr.StaffUserId IN (${placeholders})
       ORDER BY r.Code, r.Id`,
      staffUserIds
    );

    for (const row of rows) {
      const staffUserId = Number(row.StaffUserId);
      const roles = rolesByStaffUserId.get(staffUserId) ?? [];
      roles.push(mapAdminStaffRole(row));
      rolesByStaffUserId.set(staffUserId, roles);
    }

    return rolesByStaffUserId;
  }
}
