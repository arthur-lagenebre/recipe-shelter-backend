import { firstOrNull } from '../../utils/array.js';

import type {
    BeforeFirstSuperAdminCommit,
    CreateFirstSuperAdminInput,
    CreateFirstSuperAdminResult,
    SuperAdminBootstrapRepository
} from './super-admin-bootstrap.repository.interface.js';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

const SUPER_ADMIN_ROLE_CODE = 'SuperAdmin';

type RoleRow = RowDataPacket & {
    Id: number;
};

type ExistingSuperAdminRow = RowDataPacket & {
    SuperAdminCount: number;
    ActiveSuperAdminCount: number;
};

type ExistingIdentityRow = RowDataPacket & {
    Mail: string;
    Username: string;
};

export class SuperAdminBootstrapRepositoryMysql implements SuperAdminBootstrapRepository {
    constructor(private readonly db: Pool) {}

    async createFirst(input: CreateFirstSuperAdminInput, beforeCommit: BeforeFirstSuperAdminCommit): Promise<CreateFirstSuperAdminResult> {
        const conn = await this.db.getConnection();

        try {
            await conn.beginTransaction();

            const [roleRows] = await conn.execute<RoleRow[]>(`SELECT Id FROM Roles WHERE Code = ? FOR UPDATE`, [SUPER_ADMIN_ROLE_CODE]);
            const role = firstOrNull(roleRows);

            if (!role) {
                await conn.commit();
                return { status: 'role_missing' };
            }

            const [superAdminRows] = await conn.execute<ExistingSuperAdminRow[]>(
                `SELECT COUNT(*) AS SuperAdminCount, SUM(sp.Status = 'active') AS ActiveSuperAdminCount FROM StaffRoles AS sr INNER JOIN StaffProfiles AS sp ON sp.UserId = sr.StaffUserId WHERE sr.RoleId = ?`,
                [role.Id]
            );
            const existingSuperAdmin = firstOrNull(superAdminRows);

            if (existingSuperAdmin && Number(existingSuperAdmin.SuperAdminCount) > 0) {
                await conn.commit();
                return {
                    status: 'super_admin_exists',
                    active: Number(existingSuperAdmin.ActiveSuperAdminCount) > 0
                };
            }

            const [identityRows] = await conn.execute<ExistingIdentityRow[]>(
                `SELECT Mail, Username FROM Users WHERE Mail = ? OR Username = ? FOR UPDATE`,
                [input.mail, input.username]
            );

            if (identityRows.some((row) => row.Mail.toLowerCase() === input.mail.toLowerCase())) {
                await conn.commit();
                return { status: 'email_taken' };
            }

            if (identityRows.some((row) => row.Username.toLowerCase() === input.username.toLowerCase())) {
                await conn.commit();
                return { status: 'username_taken' };
            }

            const [userResult] = await conn.execute<ResultSetHeader>(
                `INSERT INTO Users (Mail, Username, Password, AccountType, Status, EmailValidatedAt) VALUES (?, ?, NULL, 'staff', 'inactive', NULL)`,
                [input.mail, input.username]
            );
            const userId = Number(userResult.insertId);

            await conn.execute(
                `INSERT INTO StaffProfiles (UserId, AccountType, Status) VALUES (?, 'staff', 'invited') AS new_staff ON DUPLICATE KEY UPDATE AccountType = new_staff.AccountType, Status = new_staff.Status`,
                [userId]
            );
            await conn.execute(`INSERT INTO StaffRoles (StaffUserId, RoleId) VALUES (?, ?)`, [userId, role.Id]);
            await conn.execute(
                `INSERT INTO StaffInvitations (StaffUserId, TokenHash, ExpiresAt, RequiresMfa) VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE), TRUE)`,
                [userId, input.invitationTokenHash, input.invitationTtlMinutes]
            );

            await beforeCommit({ userId });
            await conn.commit();
            return { status: 'created', userId };
        } catch (error) {
            await conn.rollback();

            const duplicateStatus = getDuplicateIdentityStatus(error);
            if (duplicateStatus)
                return { status: duplicateStatus };

            throw error;
        } finally {
            conn.release();
        }
    }
}

function getDuplicateIdentityStatus(error: unknown): 'email_taken' | 'username_taken' | null {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ER_DUP_ENTRY')
        return null;

    const message = 'message' in error ? String(error.message) : '';

    if (message.includes('users_mail_UK'))
        return 'email_taken';
    if (message.includes('users_username_UK'))
        return 'username_taken';

    return null;
}
