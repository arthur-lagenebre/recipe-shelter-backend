import type { CreateUserInput, User, UserWithPassword } from './user.types.js';

export interface UserRepository {
    findById(id: number): Promise<User | null>;
    findByEmail(mail: string): Promise<User | null>;
    findAuthByEmail(mail: string): Promise<UserWithPassword | null>;

    findWithPasswordById(id: number): Promise<UserWithPassword | null>;
    updateEmail(userId: number, mail: string): Promise<void>;

    isEmailTaken(mail: string): Promise<boolean>;
    isUsernameTaken(username: string): Promise<boolean>;
    create(input: CreateUserInput): Promise<User>;
    getRoleIdByName(roleName: string): Promise<number | null>;
    updatePassword(userId: number, passwordHash: string): Promise<void>;
}