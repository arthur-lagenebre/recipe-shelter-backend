import { mapTag } from './tag.mappers.js';
import { firstOrNull } from '../../utils/array.js';

import type { TagRepository } from './tag.repository.interface.js';
import type { Tag, TagRow } from './tag.types.js';
import type { Pool } from 'mysql2/promise';

export class TagRepositoryMysql implements TagRepository {
    constructor(private readonly db: Pool) { }

    async findAll(): Promise<Tag[]> {
        const [rows] = await this.db.execute(
            `SELECT t.Id, t.Name, t.Slug, tg.Id AS GroupId, tg.Name AS GroupName, tg.Slug AS GroupSlug, tg.SortOrder AS GroupSortOrder
             FROM Tags AS t
             INNER JOIN TagGroups AS tg ON tg.Id = t.GroupId
             ORDER BY tg.SortOrder ASC, t.Name ASC`);

        return (rows as TagRow[]).map(mapTag);
    }

    async findById(id: number): Promise<Tag | null> {
        const [rows] = await this.db.execute(
            `SELECT t.Id, t.Name, t.Slug, tg.Id AS GroupId, tg.Name AS GroupName, tg.Slug AS GroupSlug, tg.SortOrder AS GroupSortOrder
             FROM Tags AS t
             INNER JOIN TagGroups AS tg ON tg.Id = t.GroupId
             WHERE t.Id = ?`,
            [id]
        );

        const row = firstOrNull(rows as TagRow[]);
        return row ? mapTag(row) : null;
    }
}
