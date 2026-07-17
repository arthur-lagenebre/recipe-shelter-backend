import { assertAccountType, assertCommunityStatus, assertStaffStatus } from './user.types.js';

import type {
  CommunityProfile,
  CommunityProfileRow,
  StaffProfile,
  StaffProfileRow,
  User,
  UserRow,
  UserWithPassword,
  UserWithPasswordRow
} from './user.types.js';

export function mapCommunityProfile(row: CommunityProfileRow): CommunityProfile {
  assertCommunityStatus(row.Status);

  return {
    userId: row.UserId,
    status: row.Status,
    bannedByUserId: row.BannedByUserId,
    bannedReason: row.BannedReason,
    bannedAt: row.BannedAt,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt
  };
}

export function mapStaffProfile(row: StaffProfileRow): StaffProfile {
  assertStaffStatus(row.Status);

  return {
    userId: row.UserId,
    status: row.Status,
    mfaEnrolledAt: row.MfaEnrolledAt,
    disabledByStaffUserId: row.DisabledByStaffUserId,
    disabledReason: row.DisabledReason,
    disabledAt: row.DisabledAt,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt
  };
}

export function mapUser(row: UserRow): User {
  assertAccountType(row.AccountType);

  let status: User['status'];
  if (row.AccountType === 'community') {
    if (row.CommunityProfileUserId !== row.Id || row.StaffProfileUserId !== null)
      throw new TypeError(`Invalid profile assignment for community user: ${row.Id}`);

    assertCommunityStatus(row.CommunityStatus);
    status = row.CommunityStatus;
  } else {
    if (row.StaffProfileUserId !== row.Id || row.CommunityProfileUserId !== null)
      throw new TypeError(`Invalid profile assignment for staff user: ${row.Id}`);

    assertStaffStatus(row.StaffStatus);
    status = row.StaffStatus;
  }

  return {
    id: row.Id,
    mail: row.Mail,
    username: row.Username,
    accountType: row.AccountType,
    status,
    emailValidatedAt: row.EmailValidatedAt,
    bannedByUserId: row.AccountType === 'community' ? row.BannedByUserId : null,
    bannedReason: row.AccountType === 'community' ? row.BannedReason : null,
    bannedAt: row.AccountType === 'community' ? row.BannedAt : null,
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
