import { firstOrNull } from '../../utils/array.js';
import { createPaginatedResult, formatLimitOffsetClause } from '../../utils/pagination.js';
import { mapTag } from '../tag/tag.mappers.js';

import type { AdminTagRepository } from './admin.tags.repository.interface.js';
import type { AdminTagListFilters, AdminTagMergeResult, AdminTagRestoreResult, AdminTagUpdateInput, AdminTagWriteInput, AdminTagWriteResult } from './admin.tags.types.js';
import type { PaginatedResult, PaginationOptions } from '../../utils/pagination.js';
import type { Tag, TagRow } from '../tag/tag.types.js';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

type CountRow = RowDataPacket & { Count: number | string };
type RecipeTagAssociationRow = RowDataPacket & {
  RecipeId: number | string;
  TagId: number | string;
};

type TagWhere = {
  clause: string;
  params: Array<number | string>;
};

const TAG_SELECT = `t.Id, t.Name, t.NormalizedName, t.Slug, t.Description, t.Status, t.MergedIntoTagId,
                    t.CreatedAt, t.UpdatedAt,
                    tg.Id AS GroupId, tg.Name AS GroupName, tg.Slug AS GroupSlug, tg.SortOrder AS GroupSortOrder`;

export class AdminTagRepositoryMysql implements AdminTagRepository {
  constructor(private readonly db: Pool) { }

  async find(filters: AdminTagListFilters, pagination: PaginationOptions, db?: PoolConnection): Promise<PaginatedResult<Tag>> {
    const executor = db ?? this.db;
    const where = buildWhere(filters);
    const limitOffsetClause = formatLimitOffsetClause(pagination);
    const [countRows] = await executor.execute<CountRow[]>(
      `SELECT COUNT(*) AS Count
       FROM Tags AS t
       WHERE ${where.clause}`,
      where.params
    );
    const [rows] = await executor.execute<TagRow[]>(
      `SELECT ${TAG_SELECT}
       FROM Tags AS t
       INNER JOIN TagGroups AS tg ON tg.Id = t.GroupId
       WHERE ${where.clause}
       ORDER BY tg.SortOrder ASC, t.Name ASC, t.Id ASC
       ${limitOffsetClause}`,
      where.params
    );
    const countRow = firstOrNull(countRows);

    return createPaginatedResult(
      rows.map(mapTag),
      countRow ? Number(countRow.Count) : 0,
      pagination
    );
  }

  async findByIdsForUpdate(ids: number[], db: PoolConnection): Promise<Tag[]> {
    if (ids.length === 0)
      return [];

    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await db.execute<TagRow[]>(
      `SELECT ${TAG_SELECT}
       FROM Tags AS t
       INNER JOIN TagGroups AS tg ON tg.Id = t.GroupId
       WHERE t.Id IN (${placeholders})
       ORDER BY t.Id ASC
       FOR UPDATE`,
      ids
    );

    return rows.map(mapTag);
  }

  async groupExists(groupId: number, db: PoolConnection): Promise<boolean> {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT 1
       FROM TagGroups
       WHERE Id = ?`,
      [groupId]
    );

    return rows.length > 0;
  }

  async create(input: AdminTagWriteInput, db: PoolConnection): Promise<AdminTagWriteResult> {
    try {
      const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO Tags (GroupId, Name, NormalizedName, Slug, Description)
         VALUES (?, ?, ?, ?, ?)`,
        [input.groupId, input.name, input.normalizedName, input.slug, input.description]
      );
      const tag = await this.findById(Number(result.insertId), db);

      if (!tag)
        throw new Error('Tag created but cannot be reloaded');

      return { status: 'written', tag };
    } catch (error) {
      const duplicateStatus = getDuplicateTagStatus(error);
      if (duplicateStatus)
        return { status: duplicateStatus };

      throw error;
    }
  }

  async update(input: AdminTagUpdateInput, db: PoolConnection): Promise<AdminTagWriteResult> {
    try {
      await db.execute<ResultSetHeader>(
        `UPDATE Tags
         SET GroupId = ?, Name = ?, NormalizedName = ?, Slug = ?, Description = ?
         WHERE Id = ?`,
        [input.groupId, input.name, input.normalizedName, input.slug, input.description, input.id]
      );
      const tag = await this.findById(input.id, db);

      if (!tag)
        throw new Error('Tag updated but cannot be reloaded');

      return { status: 'written', tag };
    } catch (error) {
      const duplicateStatus = getDuplicateTagStatus(error);
      if (duplicateStatus)
        return { status: duplicateStatus };

      throw error;
    }
  }

  async hasMergedAliases(tagId: number, db: PoolConnection): Promise<boolean> {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT 1
       FROM Tags
       WHERE MergedIntoTagId = ?
       LIMIT 1`,
      [tagId]
    );

    return rows.length > 0;
  }

  async deprecate(tagId: number, db: PoolConnection): Promise<boolean> {
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE Tags
       SET Status = 'deprecated', MergedIntoTagId = NULL
       WHERE Id = ? AND Status = 'active'`,
      [tagId]
    );

    return result.affectedRows > 0;
  }

  async restore(tagId: number, db: PoolConnection): Promise<AdminTagRestoreResult> {
    try {
      const [result] = await db.execute<ResultSetHeader>(
        `UPDATE Tags
         SET Status = 'active', MergedIntoTagId = NULL
         WHERE Id = ? AND Status = 'deprecated'`,
        [tagId]
      );

      return result.affectedRows > 0 ? 'restored' : 'not_updated';
    } catch (error) {
      if (getDuplicateTagStatus(error) === 'normalized_name_taken')
        return 'normalized_name_taken';

      throw error;
    }
  }

  async merge(sourceTagId: number, targetTagId: number, db: PoolConnection): Promise<AdminTagMergeResult> {
    const [associationRows] = await db.execute<RecipeTagAssociationRow[]>(
      `SELECT RecipeId, TagId
       FROM RecipeTags
       WHERE TagId IN (?, ?)
       ORDER BY TagId ASC, RecipeId ASC
       FOR UPDATE`,
      [sourceTagId, targetTagId]
    );
    const sourceRecipeIds = new Set(
      associationRows
        .filter((row) => Number(row.TagId) === sourceTagId)
        .map((row) => Number(row.RecipeId))
    );
    const targetRecipeIds = new Set(
      associationRows
        .filter((row) => Number(row.TagId) === targetTagId)
        .map((row) => Number(row.RecipeId))
    );
    const deduplicatedRecipeCount = [...sourceRecipeIds]
      .filter((recipeId) => targetRecipeIds.has(recipeId))
      .length;
    const expectedTransferredRecipeCount = sourceRecipeIds.size - deduplicatedRecipeCount;

    const [transferResult] = await db.execute<ResultSetHeader>(
      `INSERT INTO RecipeTags (RecipeId, TagId)
       SELECT source.RecipeId, ?
       FROM RecipeTags AS source
       WHERE source.TagId = ?
         AND NOT EXISTS (
           SELECT 1
           FROM RecipeTags AS target
           WHERE target.RecipeId = source.RecipeId
             AND target.TagId = ?
         )`,
      [targetTagId, sourceTagId, targetTagId]
    );
    const [recipeResult] = await db.execute<ResultSetHeader>(
      `DELETE FROM RecipeTags
       WHERE TagId = ?`,
      [sourceTagId]
    );

    if (
      transferResult.affectedRows !== expectedTransferredRecipeCount
      || recipeResult.affectedRows !== sourceRecipeIds.size
    )
      throw new Error('Tag recipe associations changed during merge');

    const [aliasesResult] = await db.execute<ResultSetHeader>(
      `UPDATE Tags
       SET MergedIntoTagId = ?
       WHERE MergedIntoTagId = ?`,
      [targetTagId, sourceTagId]
    );
    const [tagResult] = await db.execute<ResultSetHeader>(
      `UPDATE Tags
       SET Status = 'merged', MergedIntoTagId = ?
       WHERE Id = ? AND Status IN ('active', 'deprecated')`,
      [targetTagId, sourceTagId]
    );

    return {
      merged: tagResult.affectedRows > 0,
      sourceRecipeCountBefore: sourceRecipeIds.size,
      targetRecipeCountBefore: targetRecipeIds.size,
      targetRecipeCountAfter: targetRecipeIds.size + transferResult.affectedRows,
      transferredRecipeCount: transferResult.affectedRows,
      deduplicatedRecipeCount,
      redirectedMergedTagCount: aliasesResult.affectedRows
    };
  }

  private async findById(tagId: number, db: PoolConnection): Promise<Tag | null> {
    const [rows] = await db.execute<TagRow[]>(
      `SELECT ${TAG_SELECT}
       FROM Tags AS t
       INNER JOIN TagGroups AS tg ON tg.Id = t.GroupId
       WHERE t.Id = ?`,
      [tagId]
    );
    const row = firstOrNull(rows);

    return row ? mapTag(row) : null;
  }
}

function buildWhere(filters: AdminTagListFilters): TagWhere {
  const clauses = ['1 = 1'];
  const params: Array<number | string> = [];

  if (filters.status !== undefined) {
    clauses.push('t.Status = ?');
    params.push(filters.status);
  }
  if (filters.groupId !== undefined) {
    clauses.push('t.GroupId = ?');
    params.push(filters.groupId);
  }
  if (filters.q !== undefined) {
    clauses.push('INSTR(t.Name, ?) > 0');
    params.push(filters.q);
  }

  return { clause: clauses.join(' AND '), params };
}

function getDuplicateTagStatus(error: unknown): 'normalized_name_taken' | 'slug_taken' | null {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ER_DUP_ENTRY')
    return null;

  const message = 'message' in error ? String(error.message) : '';

  if (message.includes('tags_active_normalized_name_UK'))
    return 'normalized_name_taken';
  if (message.includes('tags_slug_UK'))
    return 'slug_taken';

  return null;
}
