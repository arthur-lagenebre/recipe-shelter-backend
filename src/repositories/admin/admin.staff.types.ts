import type { StaffStatus } from '../users/user.types.js';
import type { RowDataPacket } from 'mysql2';

export type AdminStaffRole = {
  id: number;
  code: string;
  name: string;
};

export type AdminStaffAccount = {
  id: number;
  email: string;
  displayName: string;
  status: StaffStatus;
  mfaEnrolledAt: Date | null;
  disabledByStaffUserId: number | null;
  disabledByDisplayName: string | null;
  disabledReason: string | null;
  disabledAt: Date | null;
  activeSessionCount: number;
  roles: AdminStaffRole[];
  createdAt: Date;
  updatedAt: Date;
};

export type AdminStaffAccountRow = RowDataPacket & {
  Id: number;
  Email: string;
  DisplayName: string;
  Status: unknown;
  MfaEnrolledAt: Date | null;
  DisabledByStaffUserId: number | null;
  DisabledByDisplayName: string | null;
  DisabledReason: string | null;
  DisabledAt: Date | null;
  ActiveSessionCount: number | string;
  CreatedAt: Date;
  UpdatedAt: Date;
};

export type AdminStaffRoleRow = RowDataPacket & {
  StaffUserId: number;
  Id: number;
  Code: string;
  Name: string;
};

export type SuperAdminRoleIdRow = RowDataPacket & {
  Id: number;
};

export type ActiveSuperAdminRow = RowDataPacket & {
  StaffUserId: number;
};
