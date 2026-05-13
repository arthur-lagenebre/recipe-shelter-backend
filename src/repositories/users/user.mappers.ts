import type { User, UserRow, UserWithPassword, UserWithPasswordRow } from './user.types.js';

export function mapUser(row: UserRow): User {
  return {
    id: row.Id,
    mail: row.Mail,
    username: row.Username,
    roleId: row.RoleId,
    status: row.Status,
    emailValidatedAt: row.EmailValidatedAt,
    bannedByUserId: row.BannedByUserId,
    bannedReason: row.BannedReason,
    bannedAt: row.BannedAt,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt
  };
}

export function mapUserWithPassword(row: UserWithPasswordRow): UserWithPassword {
  return {
    ...mapUser(row),
    passwordHash: row.Password
  };
}
