import type { RowDataPacket } from 'mysql2';

export type Tag = {
  id: number;
  name: string;
  slug: string;
};

export type TagRow = RowDataPacket & {
  Id: number;
  Name: string;
  Slug: string;
};