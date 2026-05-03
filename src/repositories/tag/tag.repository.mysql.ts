import { mapTag } from './tag.mappers.js';
import { firstOrNull } from '../../utils/array.js';

import type { TagRepository } from './tag.repository.interface.js';
import type { Tag, TagRow } from './tag.types.js';
import type { Pool } from 'mysql2/promise';

export class TagRepositoryMysql implements TagRepository {
    constructor(private readonly db: Pool) { }

    async findAll(): Promise<Tag[]> {
        const [rows] = await this.db.execute(
            `SELECT Id, Name, Slug
             FROM Tags`);

        return (rows as TagRow[]).map(mapTag);
    }

    async findById(id: number): Promise<Tag | null> {
        const [rows] = await this.db.execute(
            `SELECT Id, Name, Slug
             FROM Tags
             WHERE Id = ?`,
            [id]
        );

        const row = firstOrNull(rows as TagRow[]);
        return row ? mapTag(row) : null;
    }
}