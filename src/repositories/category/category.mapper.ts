import type { Category, CategoryRow } from './category.types.js';

export function mapCategory(row: CategoryRow): Category {
    return {
        id: row.Id,
        name: row.Name,
        slug: row.Slug,
        iconName: row.IconName,
        createdAt: row.CreatedAt,
        updatedAt: row.UpdatedAt
    };
}
