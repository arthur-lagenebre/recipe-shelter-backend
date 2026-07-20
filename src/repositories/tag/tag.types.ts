import type { RowDataPacket } from 'mysql2';

export type TagGroup = {
  id: number;
  name: string;
  slug: string;
  sortOrder: number;
};

export type TagStatus = 'active' | 'deprecated' | 'merged';

export type Tag = {
  id: number;
  name: string;
  normalizedName: string;
  slug: string;
  description: string | null;
  status: TagStatus;
  mergedIntoTagId: number | null;
  createdAt: Date;
  updatedAt: Date;
  group: TagGroup;
};

export type TagRow = RowDataPacket & {
  Id: number;
  Name: string;
  NormalizedName: string;
  Slug: string;
  Description: string | null;
  Status: TagStatus;
  MergedIntoTagId: number | null;
  CreatedAt: Date;
  UpdatedAt: Date;
  GroupId: number;
  GroupName: string;
  GroupSlug: string;
  GroupSortOrder: number;
};
