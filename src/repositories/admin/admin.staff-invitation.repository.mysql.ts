import type {
    CreateStaffInvitationInput,
    CreateStaffInvitationResult,
    StaffInvitationRepository,
    StaffInvitationRole
} from './admin.staff-invitation.repository.interface.js';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

type RoleRow = RowDataPacket & {
    Id: number;
    Code: string;
    Name: string;
};

type ExistingIdentityRow = RowDataPacket & {
    AccountType: 'community' | 'staff';
    StaffStatus: 'invited' | 'active' | 'locked' | 'disabled' | null;
    InvitationId: number | null;
    InvitationUsedAt: Date | null;
    EmailMatches: number | boolean;
    DisplayNameMatches: number | boolean;
};

type InvitationRow = RowDataPacket & {
    Id: number;
    StaffUserId: number;
    ExpiresAt: Date;
    CreatedAt: Date;
};

export class StaffInvitationRepositoryMysql implements StaffInvitationRepository {
    constructor(private readonly db: Pool) {}

    async create(input: CreateStaffInvitationInput, db?: PoolConnection): Promise<CreateStaffInvitationResult> {
        if (db) {
            try {
                return await this.createWithinTransaction(input, db);
            } catch (error) {
                const duplicateStatus = getDuplicateIdentityStatus(error);
                if (duplicateStatus)
                    return { status: duplicateStatus };

                throw error;
            }
        }

        const connection = await this.db.getConnection();

        try {
            await connection.beginTransaction();
            const result = await this.createWithinTransaction(input, connection);
            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();

            const duplicateStatus = getDuplicateIdentityStatus(error);
            if (duplicateStatus)
                return { status: duplicateStatus };

            throw error;
        } finally {
            connection.release();
        }
    }

    private async createWithinTransaction(input: CreateStaffInvitationInput, db: PoolConnection): Promise<CreateStaffInvitationResult> {
        const [roleRows] = await db.execute<RoleRow[]>(`SELECT Id, Code, Name FROM Roles ORDER BY Id FOR UPDATE`);
        const requestedRoleCodes = new Set(input.roleCodes);
        const selectedRoles = roleRows.filter((row) => requestedRoleCodes.has(row.Code));
        const selectedRoleCodes = new Set(selectedRoles.map((role) => role.Code));
        const missingRoleCodes = input.roleCodes.filter((code) => !selectedRoleCodes.has(code));

        if (input.roleCodes.length === 0 || missingRoleCodes.length > 0)
            return { status: 'roles_missing', roleCodes: missingRoleCodes };

        const [identityRows] = await db.execute<ExistingIdentityRow[]>(
            `SELECT u.AccountType, sp.Status AS StaffStatus, si.Id AS InvitationId, si.UsedAt AS InvitationUsedAt, u.Mail = ? AS EmailMatches, u.Username = ? AS DisplayNameMatches FROM Users AS u LEFT JOIN StaffProfiles AS sp ON sp.UserId = u.Id LEFT JOIN StaffInvitations AS si ON si.StaffUserId = u.Id WHERE u.Mail = ? OR u.Username = ? FOR UPDATE`,
            [input.email, input.displayName, input.email, input.displayName]
        );
        const emailIdentity = identityRows.find((row) => Boolean(row.EmailMatches));

        if (emailIdentity) {
            if (
                emailIdentity.AccountType === 'staff' &&
                emailIdentity.StaffStatus === 'invited' &&
                emailIdentity.InvitationId !== null &&
                emailIdentity.InvitationUsedAt === null
            ) {
                return {
                    status: 'invitation_exists',
                    invitationId: Number(emailIdentity.InvitationId)
                };
            }

            return { status: 'email_taken' };
        }

        if (identityRows.some((row) => Boolean(row.DisplayNameMatches)))
            return { status: 'display_name_taken' };

        const [userResult] = await db.execute<ResultSetHeader>(
            `INSERT INTO Users (Mail, Username, Password, AccountType, Status, EmailValidatedAt) VALUES (?, ?, NULL, 'staff', 'inactive', NULL)`,
            [input.email, input.displayName]
        );
        const staffUserId = Number(userResult.insertId);
        const roleValues = selectedRoles.map(() => '(?, ?)').join(', ');
        const roleParams = selectedRoles.flatMap((role) => [staffUserId, Number(role.Id)]);

        await db.execute(
            `INSERT INTO StaffRoles (StaffUserId, RoleId)
       VALUES ${roleValues}`,
            roleParams
        );

        const [invitationResult] = await db.execute<ResultSetHeader>(
            `INSERT INTO StaffInvitations (StaffUserId, CreatedByStaffUserId, TokenHash, ExpiresAt, RequiresMfa) VALUES (?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE), TRUE)`,
            [staffUserId, input.createdByStaffUserId, input.tokenHash, input.invitationTtlMinutes]
        );
        const invitationId = Number(invitationResult.insertId);
        const [invitationRows] = await db.execute<InvitationRow[]>(
            `SELECT Id, StaffUserId, ExpiresAt, CreatedAt FROM StaffInvitations WHERE Id = ?`,
            [invitationId]
        );
        const invitation = invitationRows[0];

        if (!invitation)
            throw new Error('Staff invitation created but cannot be reloaded');

        return {
            status: 'created',
            invitation: {
                id: Number(invitation.Id),
                staffUserId: Number(invitation.StaffUserId),
                email: input.email,
                displayName: input.displayName,
                status: 'invited',
                roles: selectedRoles.map(mapRole),
                expiresAt: invitation.ExpiresAt,
                createdAt: invitation.CreatedAt
            }
        };
    }
}

function mapRole(row: RoleRow): StaffInvitationRole {
    return {
        id: Number(row.Id),
        code: row.Code,
        name: row.Name
    };
}

function getDuplicateIdentityStatus(error: unknown): 'email_taken' | 'display_name_taken' | null {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ER_DUP_ENTRY')
        return null;

    const message = 'message' in error ? String(error.message) : '';

    if (message.includes('users_mail_UK'))
        return 'email_taken';
    if (message.includes('users_username_UK'))
        return 'display_name_taken';

    return null;
}
