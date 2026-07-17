import type { CommunityProfile, CreateUserInput, StaffProfile, User, UserWithPassword } from './user.types.js';
import type { PoolConnection } from 'mysql2/promise';

export interface UserRepository {
    create(input: CreateUserInput): Promise<User>;
    findById(id: number, db?: PoolConnection): Promise<User | null>;
    findByEmail(mail: string): Promise<User | null>;
    findByUsername(username: string): Promise<User | null>;
    findCommunityProfileByUserId(userId: number): Promise<CommunityProfile | null>;
    findStaffProfileByUserId(userId: number): Promise<StaffProfile | null>;
    findAuthByEmail(mail: string): Promise<UserWithPassword | null>;
    findWithPasswordById(id: number): Promise<UserWithPassword | null>;
    markEmailValidated(userId: number): Promise<boolean>;
    updateEmail(userId: number, mail: string): Promise<void>;
    updatePassword(userId: number, passwordHash: string): Promise<void>;
    updateUsername(userId: number, username: string): Promise<void>;
    isEmailTaken(mail: string): Promise<boolean>;
    isUsernameTaken(username: string): Promise<boolean>;
}
