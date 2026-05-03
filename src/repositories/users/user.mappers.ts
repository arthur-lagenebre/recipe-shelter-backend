import type { User, UserRow, UserWithPassword } from './user.types.js';

export function mapUser(row: UserRow): User {
  return {
    id: row.Id,
    mail: row.Mail,
    username: row.Username,
    roleId: row.RoleId,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt
  };
}

export function mapUserWithPassword(row: UserRow): UserWithPassword {
  return {
    ...mapUser(row),
    passwordHash: row.Password
  };
}