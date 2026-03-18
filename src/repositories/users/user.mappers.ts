import type { User, UserRow, UserWithPassword } from './user.types.js';

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function mapUser(row: UserRow): User {
  return {
    id: row.Id,
    mail: row.Mail,
    username: row.Username,
    roleId: row.RoleId,
    createdAt: toDate(row.CreatedAt),
    updatedAt: toDate(row.UpdatedAt)
  };
}

export function mapUserWithPassword(row: UserRow): UserWithPassword {
  return {
    ...mapUser(row),
    passwordHash: row.Password
  };
}