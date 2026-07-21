import { mapCommunityProfile, mapStaffProfile, mapUser, mapUserWithPassword } from './user.mapper.js';
import { assertAccountType, assertCommunityStatus, assertStaffStatus } from './user.types.js';
import { firstOrNull } from '../../utils/array.js';

import type { UserRepository } from './user.repository.interface.js';
import type {
    CommunityProfile,
    CommunityProfileRow,
    CommunityStatus,
    CreateUserInput,
    ExistsRow,
    StaffProfile,
    StaffProfileRow,
    StaffStatus,
    User,
    UserRow,
    UserWithPassword,
    UserWithPasswordRow
} from './user.types.js';
import type { ResultSetHeader } from 'mysql2';
import type { Pool, PoolConnection } from 'mysql2/promise';

const USER_SELECT = `u.Id, u.Mail, u.Username, u.AccountType, u.EmailValidatedAt,
                     cp.UserId AS CommunityProfileUserId, cp.Status AS CommunityStatus,
                     cp.BannedByUserId, cp.BannedReason, cp.BannedAt,
                     sp.UserId AS StaffProfileUserId, sp.Status AS StaffStatus,
                     sp.SessionVersion AS StaffSessionVersion,
                     u.CreatedAt, u.UpdatedAt`;

const USER_PROFILE_JOINS = `LEFT JOIN CommunityProfiles AS cp ON cp.UserId = u.Id
                            LEFT JOIN StaffProfiles AS sp ON sp.UserId = u.Id`;

export class UserRepositoryMysql implements UserRepository {
    constructor(private readonly db: Pool) {}

    async findById(id: number, db?: PoolConnection): Promise<User | null> {
        const [rows] = await (db ?? this.db).execute(
            `SELECT ${USER_SELECT}
             FROM Users AS u
             ${USER_PROFILE_JOINS}
             WHERE u.Id = ?
             ${db ? 'FOR UPDATE' : ''}`,
            [id]
        );

        const row = firstOrNull(rows as UserRow[]);
        return row ? mapUser(row) : null;
    }

    async findByEmail(mail: string): Promise<User | null> {
        const [rows] = await this.db.execute(
            `SELECT ${USER_SELECT}
             FROM Users AS u
             ${USER_PROFILE_JOINS}
             WHERE u.Mail = ?`,
            [mail]
        );

        const row = firstOrNull(rows as UserRow[]);
        return row ? mapUser(row) : null;
    }

    async findAuthByEmail(mail: string): Promise<UserWithPassword | null> {
        const [rows] = await this.db.execute(
            `SELECT ${USER_SELECT}, u.Password
             FROM Users AS u
             ${USER_PROFILE_JOINS}
             WHERE u.Mail = ?`,
            [mail]
        );

        const row = firstOrNull(rows as UserWithPasswordRow[]);
        return row ? mapUserWithPassword(row) : null;
    }

    async findByUsername(username: string): Promise<User | null> {
        const [rows] = await this.db.execute(
            `SELECT ${USER_SELECT}
             FROM Users AS u
             ${USER_PROFILE_JOINS}
             WHERE u.Username = ?`,
            [username]
        );

        const row = firstOrNull(rows as UserRow[]);
        return row ? mapUser(row) : null;
    }

    async findCommunityProfileByUserId(userId: number): Promise<CommunityProfile | null> {
        const [rows] = await this.db.execute(
            `SELECT UserId, Status, BannedByUserId, BannedReason, BannedAt, CreatedAt, UpdatedAt FROM CommunityProfiles WHERE UserId = ?`,
            [userId]
        );

        const row = firstOrNull(rows as CommunityProfileRow[]);
        return row ? mapCommunityProfile(row) : null;
    }

    async findStaffProfileByUserId(userId: number): Promise<StaffProfile | null> {
        const [rows] = await this.db.execute(
            `SELECT UserId, Status, MfaEnrolledAt, DisabledByStaffUserId, DisabledReason, DisabledAt, CreatedAt, UpdatedAt FROM StaffProfiles WHERE UserId = ?`,
            [userId]
        );

        const row = firstOrNull(rows as StaffProfileRow[]);
        return row ? mapStaffProfile(row) : null;
    }

    async findWithPasswordById(id: number): Promise<UserWithPassword | null> {
        const [rows] = await this.db.execute(
            `SELECT ${USER_SELECT}, u.Password
             FROM Users AS u
             ${USER_PROFILE_JOINS}
             WHERE u.Id = ?`,
            [id]
        );

        const row = firstOrNull(rows as UserWithPasswordRow[]);
        return row ? mapUserWithPassword(row) : null;
    }

    async updateEmail(userId: number, mail: string): Promise<void> {
        await this.db.execute(`UPDATE Users SET Mail = ? WHERE Id = ?`, [mail, userId]);
    }

    async isEmailTaken(mail: string): Promise<boolean> {
        const [rows] = await this.db.execute(`SELECT 1 AS One FROM Users WHERE Mail = ? LIMIT 1`, [mail]);

        return firstOrNull(rows as ExistsRow[]) !== null;
    }

    async isUsernameTaken(username: string): Promise<boolean> {
        const [rows] = await this.db.execute(`SELECT 1 AS One FROM Users WHERE Username = ? LIMIT 1`, [username]);

        return firstOrNull(rows as ExistsRow[]) !== null;
    }

    async create(input: CreateUserInput): Promise<User> {
        assertAccountType(input.accountType);
        const profileStatus = getProfileStatus(input);
        const legacyStatus = getLegacyStatus(input.accountType, profileStatus);
        const conn = await this.db.getConnection();
        let insertId: number;

        try {
            await conn.beginTransaction();

            const [result] = await conn.execute<ResultSetHeader>(
                `INSERT INTO Users (Mail, Username, Password, AccountType, Status) VALUES (?, ?, ?, ?, ?)`,
                [input.mail, input.username, input.passwordHash, input.accountType, legacyStatus]
            );
            insertId = Number(result.insertId);

            if (input.accountType === 'community') {
                await conn.execute(
                    `INSERT INTO CommunityProfiles (UserId, AccountType, Status) VALUES (?, 'community', ?) ON DUPLICATE KEY UPDATE Status = ?`,
                    [insertId, profileStatus, profileStatus]
                );
            } else {
                await conn.execute(
                    `INSERT INTO StaffProfiles (UserId, AccountType, Status) VALUES (?, 'staff', ?) ON DUPLICATE KEY UPDATE Status = ?`,
                    [insertId, profileStatus, profileStatus]
                );
            }

            await conn.commit();
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }

        const created = await this.findById(insertId);

        if (!created)
            throw new Error('User created but cannot be reloaded');

        return created;
    }

    async markEmailValidated(userId: number): Promise<boolean> {
        const conn = await this.db.getConnection();

        try {
            await conn.beginTransaction();
            const [profileResult] = await conn.execute<ResultSetHeader>(
                `UPDATE CommunityProfiles SET Status = 'active' WHERE UserId = ? AND Status = 'inactive'`,
                [userId]
            );

            if (profileResult.affectedRows > 0) {
                await conn.execute(
                    `UPDATE Users SET Status = 'active', EmailValidatedAt = CURRENT_TIMESTAMP WHERE Id = ? AND AccountType = 'community'`,
                    [userId]
                );
            }

            await conn.commit();
            return profileResult.affectedRows > 0;
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    }

    async updatePassword(userId: number, passwordHash: string): Promise<void> {
        await this.db.execute(`UPDATE Users SET Password = ? WHERE Id = ?`, [passwordHash, userId]);
    }

    async updateUsername(userId: number, username: string): Promise<void> {
        await this.db.execute(`UPDATE Users SET Username = ? WHERE Id = ?`, [username, userId]);
    }
}

function getProfileStatus(input: CreateUserInput): CommunityStatus | StaffStatus {
    if (input.accountType === 'community') {
        const status = input.status ?? 'inactive';
        assertCommunityStatus(status);
        return status;
    }

    const status = input.status ?? 'invited';
    assertStaffStatus(status);
    if (status === 'active')
        throw new TypeError('Staff accounts must be activated through MFA enrollment');
    if (status === 'disabled')
        throw new TypeError('Staff accounts must be disabled through staff lifecycle management');
    return status;
}

function getLegacyStatus(accountType: CreateUserInput['accountType'], status: CommunityStatus | StaffStatus): CommunityStatus {
    if (accountType === 'community') {
        assertCommunityStatus(status);
        return status;
    }

    assertStaffStatus(status);
    if (status === 'invited')
        return 'inactive';
    if (status === 'active')
        return 'active';
    return 'banned';
}
