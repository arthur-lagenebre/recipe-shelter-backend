import type { RowDataPacket } from 'mysql2';

export const COMMUNITY_STATUSES = ['inactive', 'active', 'banned'] as const;
export const STAFF_STATUSES = ['invited', 'active', 'locked', 'disabled'] as const;

export type CommunityStatus = typeof COMMUNITY_STATUSES[number];
export type StaffStatus = typeof STAFF_STATUSES[number];
export type UserStatus = CommunityStatus | StaffStatus;

export const ACCOUNT_TYPES = ['community', 'staff'] as const;

export type AccountType = typeof ACCOUNT_TYPES[number];

export function assertAccountType(value: unknown): asserts value is AccountType {
  if (!ACCOUNT_TYPES.includes(value as AccountType))
    throw new TypeError(`Invalid account type: ${String(value)}`);
}

export function assertCommunityStatus(value: unknown): asserts value is CommunityStatus {
  if (!COMMUNITY_STATUSES.includes(value as CommunityStatus))
    throw new TypeError(`Invalid community status: ${String(value)}`);
}

export function assertStaffStatus(value: unknown): asserts value is StaffStatus {
  if (!STAFF_STATUSES.includes(value as StaffStatus))
    throw new TypeError(`Invalid staff status: ${String(value)}`);
}

export type CommunityProfile = {
  userId: number;
  status: CommunityStatus;
  bannedByUserId: number | null;
  bannedReason: string | null;
  bannedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StaffProfile = {
  userId: number;
  status: StaffStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type User = {
  id: number;
  mail: string;
  username: string;
  roleId: number;
  accountType: AccountType;
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

type CreateUserBaseInput = {
  mail: string;
  username: string;
  passwordHash: string;
  roleId: number;
};

export type CreateUserInput = CreateUserBaseInput & (
  | { accountType: 'community'; status?: CommunityStatus }
  | { accountType: 'staff'; status?: StaffStatus }
);

export type UserRow = RowDataPacket & {
  Id: number;
  Mail: string;
  Username: string;
  RoleId: number;
  AccountType: unknown;
  CommunityProfileUserId: number | null;
  CommunityStatus: unknown;
  StaffProfileUserId: number | null;
  StaffStatus: unknown;
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

export type CommunityProfileRow = RowDataPacket & {
  UserId: number;
  Status: unknown;
  BannedByUserId: number | null;
  BannedReason: string | null;
  BannedAt: Date | null;
  CreatedAt: Date;
  UpdatedAt: Date;
};

export type StaffProfileRow = RowDataPacket & {
  UserId: number;
  Status: unknown;
  CreatedAt: Date;
  UpdatedAt: Date;
};

export type ExistsRow = RowDataPacket & {
  One: number;
};

export type RoleRow = RowDataPacket & {
  Id: number;
};
