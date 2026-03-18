import type { RowDataPacket } from 'mysql2';

export type User = {
  id: number;
  mail: string;
  username: string;
  roleId: number;
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
};

export type UserRow = RowDataPacket & {
  Id: number;
  Mail: string;
  Username: string;
  Password: string;
  RoleId: number;
  CreatedAt: Date | string;
  UpdatedAt: Date | string;
};

export type ExistsRow = RowDataPacket & {
  One: number;
};

export type RoleRow = RowDataPacket & {
  Id: number;
};