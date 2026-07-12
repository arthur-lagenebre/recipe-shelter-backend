import type { RowDataPacket } from 'mysql2';

export type TagGroup = {
  id: number;
  name: string;
  slug: string;
  sortOrder: number;
};

export type Tag = {
  id: number;
  name: string;
  slug: string;
  group: TagGroup;
};

export type TagRow = RowDataPacket & {
  Id: number;
  Name: string;
  Slug: string;
  GroupId: number;
  GroupName: string;
  GroupSlug: string;
  GroupSortOrder: number;
};
