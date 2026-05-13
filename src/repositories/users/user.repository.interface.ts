import type { CreateUserInput, User, UserWithPassword } from './user.types.js';

export interface UserRepository {
    create(input: CreateUserInput): Promise<User>;
    findById(id: number): Promise<User | null>;
    findByEmail(mail: string): Promise<User | null>;
    findByUsername(username: string): Promise<User | null>;
    findAuthByEmail(mail: string): Promise<UserWithPassword | null>;
    findWithPasswordById(id: number): Promise<UserWithPassword | null>;
    getRoleIdByName(roleName: string): Promise<number | null>;
    markEmailValidated(userId: number): Promise<boolean>;
    ban(userId: number, bannedByUserId: number, reason: string): Promise<boolean>;
    unban(userId: number): Promise<boolean>;
    updateEmail(userId: number, mail: string): Promise<void>;
    updatePassword(userId: number, passwordHash: string): Promise<void>;
    updateUsername(userId: number, username: string): Promise<void>;
    isEmailTaken(mail: string): Promise<boolean>;
    isUsernameTaken(username: string): Promise<boolean>;
}
