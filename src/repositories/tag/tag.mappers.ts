import type { Tag, TagRow } from './tag.types.js';

export function mapTag(row: TagRow): Tag {
  return {
    id: row.Id,
    name: row.Name,
    slug: row.Slug,
    group: {
      id: row.GroupId,
      name: row.GroupName,
      slug: row.GroupSlug,
      sortOrder: row.GroupSortOrder
    }
  };
}
