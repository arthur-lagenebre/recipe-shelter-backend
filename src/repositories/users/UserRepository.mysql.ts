import type { Pool } from 'mysql2/promise';
import { IUserRepository } from './IUserRepository.js';
import { CreateUserInput, User, UserWithPassword } from './user.types.js';
import { mapUser, mapUserWithPassword } from './user.mappers.js';

export class UserRepositoryMysql implements IUserRepository {
    constructor(private readonly db: Pool) { }

    async findById(id: number): Promise<User | null> {
        const [rows] = await this.db.query(
            `SELECT Id, Mail, Username, Password, RoleId, CreatedAt, UpdatedAt
            FROM Users
            WHERE Id = ?`,
            [id],
        );

        const array = rows as any[];

        if (!array.length)
            return null;

        return mapUser(array[0]);
    }

    async findByEmail(mail: string): Promise<User | null> {
        const [rows] = await this.db.query(
            `SELECT Id, Mail, Username, Password, RoleId, CreatedAt, UpdatedAt
            FROM Users
            WHERE Mail = ?`,
            [mail],
        );

        const array = rows as any[];

        if (!array.length)
            return null;

        return mapUser(array[0]);
    }

    async findAuthByEmail(mail: string): Promise<UserWithPassword | null> {
        const [rows] = await this.db.query(
            `SELECT Id, Mail, Username, Password, RoleId, CreatedAt, UpdatedAt
            FROM Users
            WHERE Mail = ?`,
            [mail],
        );

        const array = rows as any[];

        if (!array.length)
            return null;

        return mapUserWithPassword(array[0]);
    }

    async isEmailTaken(mail: string): Promise<boolean> {
        const [rows] = await this.db.query(`SELECT 1 AS One FROM Users WHERE Mail = ? LIMIT 1`, [mail]);

        return (rows as any[]).length > 0;
    }

    async isUsernameTaken(username: string): Promise<boolean> {
        const [rows] = await this.db.query(`SELECT 1 AS One FROM Users WHERE Username = ? LIMIT 1`, [username]);

        return (rows as any[]).length > 0;
    }

    async getRoleIdByName(roleName: string): Promise<number | null> {
        const [rows] = await this.db.query(`SELECT Id FROM Roles WHERE Name = ? LIMIT 1`, [roleName]);
        const array = rows as any[];

        if (!array.length)
            return null;

        return Number(array[0].Id);
    }

    async create(input: CreateUserInput): Promise<User> {
        const [result] = await this.db.execute(
            `INSERT INTO Users (Mail, Username, Password, RoleId)
            VALUES (?, ?, ?, ?)`,
            [input.mail, input.username, input.passwordHash, input.roleId],
        );

        const insertId = Number((result as any).insertId);
        const created = await this.findById(insertId);

        if (!created)
            throw new Error('User created but cannot be reloaded');

        return created;
    }
}