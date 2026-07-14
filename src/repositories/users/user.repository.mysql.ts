import { mapUser, mapUserWithPassword } from './user.mappers.js';
import { assertAccountType } from './user.types.js';
import { firstOrNull } from '../../utils/array.js';

import type { UserRepository } from './user.repository.interface.js';
import type { CreateUserInput, ExistsRow, RoleRow, User, UserRow, UserWithPassword, UserWithPasswordRow } from './user.types.js';
import type { ResultSetHeader } from 'mysql2';
import type { Pool } from 'mysql2/promise';

export class UserRepositoryMysql implements UserRepository {
    constructor(private readonly db: Pool) { }

    async findById(id: number): Promise<User | null> {
        const [rows] = await this.db.execute(
            `SELECT Id, Mail, Username, RoleId, AccountType, Status, EmailValidatedAt, BannedByUserId, BannedReason, BannedAt, CreatedAt, UpdatedAt
             FROM Users
             WHERE Id = ?`,
            [id]
        );

        const row = firstOrNull(rows as UserRow[]);
        return row ? mapUser(row) : null;
    }

    async findByEmail(mail: string): Promise<User | null> {
        const [rows] = await this.db.execute(
            `SELECT Id, Mail, Username, RoleId, AccountType, Status, EmailValidatedAt, BannedByUserId, BannedReason, BannedAt, CreatedAt, UpdatedAt
             FROM Users
             WHERE Mail = ?`,
            [mail]
        );

        const row = firstOrNull(rows as UserRow[]);
        return row ? mapUser(row) : null;
    }

    async findAuthByEmail(mail: string): Promise<UserWithPassword | null> {
        const [rows] = await this.db.execute(
            `SELECT Id, Mail, Username, Password, RoleId, AccountType, Status, EmailValidatedAt, BannedByUserId, BannedReason, BannedAt, CreatedAt, UpdatedAt
             FROM Users
             WHERE Mail = ?`,
            [mail]
        );

        const row = firstOrNull(rows as UserWithPasswordRow[]);
        return row ? mapUserWithPassword(row) : null;
    }

    async findByUsername(username: string): Promise<User | null> {
        const [rows] = await this.db.execute(
            `SELECT Id, Mail, Username, RoleId, AccountType, Status, EmailValidatedAt, BannedByUserId, BannedReason, BannedAt, CreatedAt, UpdatedAt
             FROM Users
             WHERE Username = ?`,
            [username]
        );

        const row = firstOrNull(rows as UserRow[]);
        return row ? mapUser(row) : null;
    }

    async findWithPasswordById(id: number): Promise<UserWithPassword | null> {
        const [rows] = await this.db.execute(
            `SELECT Id, Mail, Username, Password, RoleId, AccountType, Status, EmailValidatedAt, BannedByUserId, BannedReason, BannedAt, CreatedAt, UpdatedAt
             FROM Users
             WHERE Id = ?`,
            [id]
        );

        const row = firstOrNull(rows as UserWithPasswordRow[]);
        return row ? mapUserWithPassword(row) : null;
    }

    async updateEmail(userId: number, mail: string): Promise<void> {
        await this.db.execute(
            `UPDATE Users
             SET Mail = ?
             WHERE Id = ?`,
            [mail, userId]
        );
    }

    async isEmailTaken(mail: string): Promise<boolean> {
        const [rows] = await this.db.execute(
            `SELECT 1 AS One
             FROM Users
             WHERE Mail = ?
             LIMIT 1`,
            [mail]
        );

        return firstOrNull(rows as ExistsRow[]) !== null;
    }

    async isUsernameTaken(username: string): Promise<boolean> {
        const [rows] = await this.db.execute(
            `SELECT 1 AS One
             FROM Users
             WHERE Username = ?
             LIMIT 1`,
            [username]
        );

        return firstOrNull(rows as ExistsRow[]) !== null;
    }

    async getRoleIdByName(roleName: string): Promise<number | null> {
        const [rows] = await this.db.execute(
            `SELECT Id
             FROM Roles
             WHERE Name = ?
             LIMIT 1`,
            [roleName]
        );

        const row = firstOrNull(rows as RoleRow[]);
        return row ? Number(row.Id) : null;
    }

    async create(input: CreateUserInput): Promise<User> {
        assertAccountType(input.accountType);

        const [result] = await this.db.execute(
            `INSERT INTO Users (Mail, Username, Password, RoleId, AccountType, Status)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [input.mail, input.username, input.passwordHash, input.roleId, input.accountType, input.status ?? 'inactive']
        );

        const insertId = Number((result as { insertId: number }).insertId);
        const created = await this.findById(insertId);

        if (!created)
            throw new Error('User created but cannot be reloaded');

        return created;
    }

    async markEmailValidated(userId: number): Promise<boolean> {
        const [result] = await this.db.execute<ResultSetHeader>(
            `UPDATE Users
             SET Status = 'active', EmailValidatedAt = CURRENT_TIMESTAMP
             WHERE Id = ?`,
            [userId]
        );

        return result.affectedRows > 0;
    }

    async updatePassword(userId: number, passwordHash: string): Promise<void> {
        await this.db.execute(
            `UPDATE Users
             SET Password = ?
             WHERE Id = ?`,
            [passwordHash, userId]
        );
    }

    async updateUsername(userId: number, username: string): Promise<void> {
        await this.db.execute(
            `UPDATE Users
             SET Username = ?
             WHERE Id = ?`,
            [username, userId]
        );
    }
}
