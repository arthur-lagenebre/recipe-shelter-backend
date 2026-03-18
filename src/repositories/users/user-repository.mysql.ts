import type { Pool } from 'mysql2/promise';
import { firstOrNull } from '../../utils/array.js';
import type { UserRepository } from './user-repository.interface.js';
import type { CreateUserInput, ExistsRow, RoleRow, User, UserRow, UserWithPassword } from './user.types.js';
import { mapUser, mapUserWithPassword } from './user.mappers.js';

export class UserRepositoryMysql implements UserRepository {
    constructor(private readonly db: Pool) { }

    async findById(id: number): Promise<User | null> {
        const [rows] = await this.db.query(
            `SELECT Id, Mail, Username, Password, RoleId, CreatedAt, UpdatedAt
            FROM Users
            WHERE Id = ?`,
            [id]
        );

        const row = firstOrNull(rows as UserRow[]);
        return row ? mapUser(row) : null;
    }

    async findByEmail(mail: string): Promise<User | null> {
        const [rows] = await this.db.query(
            `SELECT Id, Mail, Username, Password, RoleId, CreatedAt, UpdatedAt
            FROM Users
            WHERE Mail = ?`,
            [mail]
        );

        const row = firstOrNull(rows as UserRow[]);
        return row ? mapUser(row) : null;
    }

    async findAuthByEmail(mail: string): Promise<UserWithPassword | null> {
        const [rows] = await this.db.query(
            `SELECT Id, Mail, Username, Password, RoleId, CreatedAt, UpdatedAt
            FROM Users
            WHERE Mail = ?`,
            [mail]
        );

        const row = firstOrNull(rows as UserRow[]);
        return row ? mapUserWithPassword(row) : null;
    }

    async isEmailTaken(mail: string): Promise<boolean> {
        const [rows] = await this.db.query(
            `SELECT 1 AS One
            FROM Users
            WHERE Mail = ?
            LIMIT 1`,
            [mail]
        );

        return firstOrNull(rows as ExistsRow[]) !== null;
    }

    async isUsernameTaken(username: string): Promise<boolean> {
        const [rows] = await this.db.query(
            `SELECT 1 AS One
            FROM Users
            WHERE Username = ?
            LIMIT 1`,
            [username]
        );

        return firstOrNull(rows as ExistsRow[]) !== null;
    }

    async getRoleIdByName(roleName: string): Promise<number | null> {
        const [rows] = await this.db.query(
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
        const [result] = await this.db.execute(
            `INSERT INTO Users (Mail, Username, Password, RoleId)
            VALUES (?, ?, ?, ?)`,
            [input.mail, input.username, input.passwordHash, input.roleId]
        );

        const insertId = Number((result as { insertId: number }).insertId);
        const created = await this.findById(insertId);

        if (!created)
            throw new Error('User created but cannot be reloaded');

        return created;
    }
}