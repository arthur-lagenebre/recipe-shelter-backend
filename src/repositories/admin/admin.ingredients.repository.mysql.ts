import { firstOrNull } from '../../utils/array.js';
import { createPaginatedResult, formatLimitOffsetClause } from '../../utils/pagination.js';
import { mapIngredient, mapIngredientAlias } from '../ingredients/ingredient.mapper.js';

import type { AdminIngredientRepository } from './admin.ingredients.repository.interface.js';
import type { AdminIngredientAliasListFilters, AdminIngredientAliasUpdateInput, AdminIngredientAliasWriteInput, AdminIngredientAliasWriteResult, AdminIngredientListFilters, AdminIngredientMergeInput, AdminIngredientMergeResult, AdminIngredientRestoreResult, AdminIngredientUpdateInput, AdminIngredientWriteInput, AdminIngredientWriteResult } from './admin.ingredients.types.js';
import type { PaginatedResult, PaginationOptions } from '../../utils/pagination.js';
import type { Ingredient, IngredientAlias, IngredientAliasRow, IngredientRow } from '../ingredients/ingredient.types.js';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

type CountRow = RowDataPacket & { Count: number | string };
type IdRow = RowDataPacket & { Id: number | string; IngredientId?: number | string };
type IngredientIdRow = RowDataPacket & { IngredientId: number | string };
type MergeAliasRow = IdRow & { NormalizedName: string; LanguageCode: string };
type Where = { clause: string; params: Array<number | string> };

const INGREDIENT_SELECT = `i.Id, i.Name, i.NormalizedName, i.Slug, i.Status,
                           i.MergedIntoIngredientId, i.CreatedAt, i.UpdatedAt`;
const ALIAS_SELECT = `ia.Id, ia.IngredientId, ia.Name, ia.NormalizedName,
                      ia.LanguageCode, ia.CreatedAt, ia.UpdatedAt`;

export class AdminIngredientRepositoryMysql implements AdminIngredientRepository {
  constructor(private readonly db: Pool) { }

  async find(filters: AdminIngredientListFilters, pagination: PaginationOptions, db?: PoolConnection): Promise<PaginatedResult<Ingredient>> {
    const executor = db ?? this.db;
    const where = buildIngredientWhere(filters);
    const [countRows] = await executor.execute<CountRow[]>(
      `SELECT COUNT(*) AS Count
       FROM Ingredients AS i
       WHERE ${where.clause}`,
      where.params
    );
    const [rows] = await executor.execute<IngredientRow[]>(
      `SELECT ${INGREDIENT_SELECT}
       FROM Ingredients AS i
       WHERE ${where.clause}
       ORDER BY i.Name ASC, i.Id ASC
       ${formatLimitOffsetClause(pagination)}`,
      where.params
    );

    return createPaginatedResult(rows.map(mapIngredient), Number(firstOrNull(countRows)?.Count ?? 0), pagination);
  }

  async findById(ingredientId: number, db?: PoolConnection): Promise<Ingredient | null> {
    const [rows] = await (db ?? this.db).execute<IngredientRow[]>(
      `SELECT ${INGREDIENT_SELECT}
       FROM Ingredients AS i
       WHERE i.Id = ?`,
      [ingredientId]
    );
    const row = firstOrNull(rows);

    return row ? mapIngredient(row) : null;
  }

  async findByIdsForUpdate(ids: number[], db: PoolConnection): Promise<Ingredient[]> {
    if (ids.length === 0)
      return [];

    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await db.execute<IngredientRow[]>(
      `SELECT ${INGREDIENT_SELECT}
       FROM Ingredients AS i
       WHERE i.Id IN (${placeholders})
       ORDER BY i.Id ASC
       FOR UPDATE`,
      ids
    );

    return rows.map(mapIngredient);
  }

  async create(input: AdminIngredientWriteInput, db: PoolConnection): Promise<AdminIngredientWriteResult> {
    try {
      const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO Ingredients (Name, NormalizedName, Slug)
         VALUES (?, ?, ?)`,
        [input.name, input.normalizedName, input.slug]
      );
      const ingredient = await this.findById(Number(result.insertId), db);

      if (!ingredient)
        throw new Error('Ingredient created but cannot be reloaded');

      return { status: 'written', ingredient };
    } catch (error) {
      const duplicateStatus = getDuplicateIngredientStatus(error);
      if (duplicateStatus)
        return { status: duplicateStatus };

      throw error;
    }
  }

  async update(input: AdminIngredientUpdateInput, db: PoolConnection): Promise<AdminIngredientWriteResult> {
    try {
      await db.execute<ResultSetHeader>(
        `UPDATE Ingredients
         SET Name = ?, NormalizedName = ?, Slug = ?
         WHERE Id = ?`,
        [input.name, input.normalizedName, input.slug, input.id]
      );
      const ingredient = await this.findById(input.id, db);

      if (!ingredient)
        throw new Error('Ingredient updated but cannot be reloaded');

      return { status: 'written', ingredient };
    } catch (error) {
      const duplicateStatus = getDuplicateIngredientStatus(error);
      if (duplicateStatus)
        return { status: duplicateStatus };

      throw error;
    }
  }

  async hasAliases(ingredientId: number, db: PoolConnection): Promise<boolean> {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT 1 FROM IngredientAliases WHERE IngredientId = ? LIMIT 1`,
      [ingredientId]
    );

    return rows.length > 0;
  }

  async hasMergedSources(ingredientId: number, db: PoolConnection): Promise<boolean> {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT 1 FROM Ingredients WHERE MergedIntoIngredientId = ? LIMIT 1`,
      [ingredientId]
    );

    return rows.length > 0;
  }

  async deprecate(ingredientId: number, db: PoolConnection): Promise<boolean> {
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE Ingredients
       SET Status = 'deprecated', MergedIntoIngredientId = NULL
       WHERE Id = ? AND Status = 'active'`,
      [ingredientId]
    );

    return result.affectedRows > 0;
  }

  async restore(ingredientId: number, db: PoolConnection): Promise<AdminIngredientRestoreResult> {
    try {
      const [result] = await db.execute<ResultSetHeader>(
        `UPDATE Ingredients
         SET Status = 'active', MergedIntoIngredientId = NULL
         WHERE Id = ? AND Status = 'deprecated'`,
        [ingredientId]
      );

      return result.affectedRows > 0 ? 'restored' : 'not_updated';
    } catch (error) {
      if (getDuplicateIngredientStatus(error) === 'normalized_name_taken')
        return 'normalized_name_taken';

      throw error;
    }
  }

  async merge(input: AdminIngredientMergeInput, db: PoolConnection): Promise<AdminIngredientMergeResult> {
    const {
      sourceIngredientId,
      targetIngredientId,
      sourceName,
      sourceNormalizedName,
      sourceNameLanguageCode
    } = input;
    const [mergedRows] = await db.execute<IdRow[]>(
      `SELECT Id
       FROM Ingredients
       WHERE MergedIntoIngredientId = ?
       ORDER BY Id ASC
       FOR UPDATE`,
      [sourceIngredientId]
    );
    const [aliasRows] = await db.execute<MergeAliasRow[]>(
      `SELECT Id, IngredientId, NormalizedName, LanguageCode
       FROM IngredientAliases
       WHERE IngredientId IN (?, ?)
          OR (LanguageCode = ? AND NormalizedName = ?)
       ORDER BY Id ASC
       FOR UPDATE`,
      [sourceIngredientId, targetIngredientId, sourceNameLanguageCode, sourceNormalizedName]
    );
    const sourceNameAlias = aliasRows.find((row) =>
      row.LanguageCode === sourceNameLanguageCode
      && row.NormalizedName === sourceNormalizedName
    );
    const sourceNameAliasIngredientId = sourceNameAlias
      ? Number(sourceNameAlias.IngredientId)
      : null;

    if (
      sourceNameAliasIngredientId !== null
      && sourceNameAliasIngredientId !== sourceIngredientId
      && sourceNameAliasIngredientId !== targetIngredientId
    ) {
      return {
        status: 'source_name_alias_conflict',
        conflictingIngredientId: sourceNameAliasIngredientId
      };
    }

    const sourceAliasCount = countIngredientRows(aliasRows, sourceIngredientId);
    const targetAliasCount = countIngredientRows(aliasRows, targetIngredientId);
    const sourceNameAliasResolution = sourceNameAliasIngredientId === sourceIngredientId
      ? 'reused_source_alias' as const
      : sourceNameAliasIngredientId === targetIngredientId
        ? 'reused_target_alias' as const
        : 'created' as const;

    if (sourceNameAliasResolution === 'created') {
      try {
        await db.execute<ResultSetHeader>(
          `INSERT INTO IngredientAliases (IngredientId, Name, NormalizedName, LanguageCode)
           VALUES (?, ?, ?, ?)`,
          [targetIngredientId, sourceName, sourceNormalizedName, sourceNameLanguageCode]
        );
      } catch (error) {
        if (isDuplicateAlias(error)) {
          return {
            status: 'source_name_alias_conflict',
            conflictingIngredientId: await findAliasIngredientId(
              db,
              sourceNameLanguageCode,
              sourceNormalizedName
            )
          };
        }

        throw error;
      }
    }

    const [recipeRows] = await db.execute<IdRow[]>(
      `SELECT Id, IngredientId
       FROM RecipeIngredients
       WHERE IngredientId IN (?, ?)
       ORDER BY Id ASC
       FOR UPDATE`,
      [sourceIngredientId, targetIngredientId]
    );
    const sourceRecipeCount = countIngredientRows(recipeRows, sourceIngredientId);
    const targetRecipeCount = countIngredientRows(recipeRows, targetIngredientId);
    const [recipeResult] = await db.execute<ResultSetHeader>(
      `UPDATE RecipeIngredients
       SET IngredientId = ?
       WHERE IngredientId = ?`,
      [targetIngredientId, sourceIngredientId]
    );

    if (recipeResult.affectedRows !== sourceRecipeCount)
      throw new Error('Ingredient recipe associations changed during merge');

    const [redirectResult] = await db.execute<ResultSetHeader>(
      `UPDATE Ingredients
       SET MergedIntoIngredientId = ?
       WHERE MergedIntoIngredientId = ?`,
      [targetIngredientId, sourceIngredientId]
    );

    if (redirectResult.affectedRows !== mergedRows.length)
      throw new Error('Merged ingredient references changed during merge');

    const [aliasResult] = await db.execute<ResultSetHeader>(
      `UPDATE IngredientAliases
       SET IngredientId = ?
       WHERE IngredientId = ?`,
      [targetIngredientId, sourceIngredientId]
    );

    if (aliasResult.affectedRows !== sourceAliasCount)
      throw new Error('Ingredient aliases changed during merge');

    const [ingredientResult] = await db.execute<ResultSetHeader>(
      `UPDATE Ingredients
       SET Status = 'merged', MergedIntoIngredientId = ?
       WHERE Id = ? AND Status IN ('active', 'deprecated')`,
      [targetIngredientId, sourceIngredientId]
    );

    if (ingredientResult.affectedRows === 0)
      return { status: 'not_merged' };

    return {
      status: 'merged',
      sourceRecipeAssociationCountBefore: sourceRecipeCount,
      targetRecipeAssociationCountBefore: targetRecipeCount,
      targetRecipeAssociationCountAfter: targetRecipeCount + recipeResult.affectedRows,
      transferredRecipeAssociationCount: recipeResult.affectedRows,
      sourceAliasCountBefore: sourceAliasCount,
      targetAliasCountBefore: targetAliasCount,
      targetAliasCountAfter: targetAliasCount
        + aliasResult.affectedRows
        + (sourceNameAliasResolution === 'created' ? 1 : 0),
      transferredAliasCount: aliasResult.affectedRows,
      sourceNameAliasResolution,
      redirectedMergedIngredientCount: redirectResult.affectedRows
    };
  }

  async findAliases(ingredientId: number, filters: AdminIngredientAliasListFilters, pagination: PaginationOptions, db?: PoolConnection): Promise<PaginatedResult<IngredientAlias>> {
    const executor = db ?? this.db;
    const where = buildAliasWhere(ingredientId, filters);
    const [countRows] = await executor.execute<CountRow[]>(
      `SELECT COUNT(*) AS Count
       FROM IngredientAliases AS ia
       WHERE ${where.clause}`,
      where.params
    );
    const [rows] = await executor.execute<IngredientAliasRow[]>(
      `SELECT ${ALIAS_SELECT}
       FROM IngredientAliases AS ia
       WHERE ${where.clause}
       ORDER BY ia.LanguageCode ASC, ia.Name ASC, ia.Id ASC
       ${formatLimitOffsetClause(pagination)}`,
      where.params
    );

    return createPaginatedResult(rows.map(mapIngredientAlias), Number(firstOrNull(countRows)?.Count ?? 0), pagination);
  }

  async findAliasForUpdate(ingredientId: number, aliasId: number, db: PoolConnection): Promise<IngredientAlias | null> {
    const [rows] = await db.execute<IngredientAliasRow[]>(
      `SELECT ${ALIAS_SELECT}
       FROM IngredientAliases AS ia
       WHERE ia.Id = ? AND ia.IngredientId = ?
       FOR UPDATE`,
      [aliasId, ingredientId]
    );
    const row = firstOrNull(rows);

    return row ? mapIngredientAlias(row) : null;
  }

  async isMergeSourceNameAlias(ingredientId: number, aliasId: number, db: PoolConnection): Promise<boolean> {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT 1
       FROM IngredientAliases AS ia
       INNER JOIN Ingredients AS merged_source
         ON merged_source.Status = 'merged'
        AND merged_source.MergedIntoIngredientId = ia.IngredientId
        AND merged_source.NormalizedName = ia.NormalizedName
       WHERE ia.Id = ?
         AND ia.IngredientId = ?
         AND ia.LanguageCode = 'fr'
       LIMIT 1`,
      [aliasId, ingredientId]
    );

    return rows.length > 0;
  }

  async createAlias(input: AdminIngredientAliasWriteInput, db: PoolConnection): Promise<AdminIngredientAliasWriteResult> {
    try {
      const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO IngredientAliases (IngredientId, Name, NormalizedName, LanguageCode)
         VALUES (?, ?, ?, ?)`,
        [input.ingredientId, input.name, input.normalizedName, input.languageCode]
      );
      const alias = await this.findAliasForUpdate(input.ingredientId, Number(result.insertId), db);

      if (!alias)
        throw new Error('Ingredient alias created but cannot be reloaded');

      return { status: 'written', alias };
    } catch (error) {
      if (isDuplicateAlias(error))
        return { status: 'alias_taken' };

      throw error;
    }
  }

  async updateAlias(input: AdminIngredientAliasUpdateInput, db: PoolConnection): Promise<AdminIngredientAliasWriteResult> {
    try {
      await db.execute<ResultSetHeader>(
        `UPDATE IngredientAliases
         SET Name = ?, NormalizedName = ?, LanguageCode = ?
         WHERE Id = ? AND IngredientId = ?`,
        [input.name, input.normalizedName, input.languageCode, input.id, input.ingredientId]
      );
      const alias = await this.findAliasForUpdate(input.ingredientId, input.id, db);

      if (!alias)
        throw new Error('Ingredient alias updated but cannot be reloaded');

      return { status: 'written', alias };
    } catch (error) {
      if (isDuplicateAlias(error))
        return { status: 'alias_taken' };

      throw error;
    }
  }

  async deleteAlias(ingredientId: number, aliasId: number, db: PoolConnection): Promise<boolean> {
    const [result] = await db.execute<ResultSetHeader>(
      `DELETE FROM IngredientAliases
       WHERE Id = ? AND IngredientId = ?`,
      [aliasId, ingredientId]
    );

    return result.affectedRows > 0;
  }
}

function buildIngredientWhere(filters: AdminIngredientListFilters): Where {
  const clauses = ['1 = 1'];
  const params: Array<number | string> = [];

  if (filters.status !== undefined) {
    clauses.push('i.Status = ?');
    params.push(filters.status);
  }
  if (filters.q !== undefined) {
    clauses.push(`(
      INSTR(i.Name, ?) > 0
      OR INSTR(i.NormalizedName, ?) > 0
      OR INSTR(i.Slug, ?) > 0
      OR EXISTS (
        SELECT 1 FROM IngredientAliases AS search_alias
        WHERE search_alias.IngredientId = i.Id AND INSTR(search_alias.Name, ?) > 0
      )
    )`);
    params.push(filters.q, filters.q, filters.q, filters.q);
  }

  return { clause: clauses.join(' AND '), params };
}

function buildAliasWhere(ingredientId: number, filters: AdminIngredientAliasListFilters): Where {
  const clauses = ['ia.IngredientId = ?'];
  const params: Array<number | string> = [ingredientId];

  if (filters.languageCode !== undefined) {
    clauses.push('ia.LanguageCode = ?');
    params.push(filters.languageCode);
  }
  if (filters.q !== undefined) {
    clauses.push('(INSTR(ia.Name, ?) > 0 OR INSTR(ia.NormalizedName, ?) > 0)');
    params.push(filters.q, filters.q);
  }

  return { clause: clauses.join(' AND '), params };
}

function countIngredientRows(rows: IdRow[], ingredientId: number): number {
  return rows.filter((row) => Number(row.IngredientId) === ingredientId).length;
}

async function findAliasIngredientId(
  db: PoolConnection,
  languageCode: string,
  normalizedName: string
): Promise<number | null> {
  const [rows] = await db.execute<IngredientIdRow[]>(
    `SELECT IngredientId
     FROM IngredientAliases
     WHERE LanguageCode = ? AND NormalizedName = ?
     FOR UPDATE`,
    [languageCode, normalizedName]
  );
  const ingredientId = firstOrNull(rows)?.IngredientId;

  return ingredientId === undefined ? null : Number(ingredientId);
}

function getDuplicateIngredientStatus(error: unknown): 'normalized_name_taken' | 'slug_taken' | null {
  if (!isDuplicateEntry(error))
    return null;

  const message = 'message' in error ? String(error.message) : '';
  if (message.includes('ingredients_active_normalized_name_UK'))
    return 'normalized_name_taken';
  if (message.includes('ingredients_slug_UK'))
    return 'slug_taken';

  return null;
}

function isDuplicateAlias(error: unknown): boolean {
  return isDuplicateEntry(error)
    && 'message' in error
    && String(error.message).includes('ingredient_aliases_language_normalized_name_UK');
}

function isDuplicateEntry(error: unknown): error is { code: string; message?: unknown } {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ER_DUP_ENTRY');
}
