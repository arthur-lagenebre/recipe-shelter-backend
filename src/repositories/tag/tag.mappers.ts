import type { Tag, TagRow } from './tag.types.js';

export function mapTag(row: TagRow): Tag {
  return {
    id: row.Id,
    name: row.Name,
    normalizedName: row.NormalizedName,
    slug: row.Slug,
    description: row.Description,
    status: row.Status,
    mergedIntoTagId: row.MergedIntoTagId,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt,
    group: {
      id: row.GroupId,
      name: row.GroupName,
      slug: row.GroupSlug,
      sortOrder: row.GroupSortOrder
    }
  };
}
