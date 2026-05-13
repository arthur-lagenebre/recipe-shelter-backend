import type { RowDataPacket } from 'mysql2';

export type UserStatus = 'inactive' | 'active' | 'banned';

export type User = {
  id: number;
  mail: string;
  username: string;
  roleId: number;
  status: UserStatus;
  emailValidatedAt: Date | null;
  bannedByUserId: number | null;
  bannedReason: string | null;
  bannedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UserWithPassword = User & {
  passwordHash: string;
};

export type CreateUserInput = {
  mail: string;
  username: string;
  passwordHash: string;
  roleId: number;
  status?: UserStatus;
};

export type UserRow = RowDataPacket & {
  Id: number;
  Mail: string;
  Username: string;
  RoleId: number;
  Status: UserStatus;
  EmailValidatedAt: Date | null;
  BannedByUserId: number | null;
  BannedReason: string | null;
  BannedAt: Date | null;
  CreatedAt: Date;
  UpdatedAt: Date;
};

export type UserWithPasswordRow = UserRow & {
  Password: string;
};

export type ExistsRow = RowDataPacket & {
  One: number;
};

export type RoleRow = RowDataPacket & {
  Id: number;
};
