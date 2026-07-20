import { mapCatalogProposal } from './catalog-proposals.mapper.js';
import { firstOrNull } from '../../utils/array.js';

import type { CatalogProposalRepository } from './catalog-proposals.repository.interface.js';
import type { CatalogProposalRow, CatalogProposalType, CatalogProposalWriteResult, CreateCatalogProposalInput } from './catalog-proposals.types.js';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { Pool } from 'mysql2/promise';

type ExistsRow = RowDataPacket & {
  Exists: number;
};

export class CatalogProposalRepositoryMysql implements CatalogProposalRepository {
  constructor(private readonly db: Pool) { }

  async recipeExistsForAuthor(recipeId: number, authorUserId: number): Promise<boolean> {
    const [rows] = await this.db.execute<ExistsRow[]>(
      `SELECT EXISTS(
         SELECT 1
         FROM Recipes
         WHERE Id = ? AND UserId = ?
       ) AS \`Exists\``,
      [recipeId, authorUserId]
    );

    return Boolean(firstOrNull(rows)?.Exists);
  }

  async activeCatalogNameExists(proposalType: CatalogProposalType, normalizedName: string): Promise<boolean> {
    const [rows] = proposalType === 'tag'
      ? await this.db.execute<ExistsRow[]>(
        `SELECT EXISTS(
           SELECT 1
           FROM Tags
           WHERE Status = 'active' AND NormalizedName = ?
         ) AS \`Exists\``,
        [normalizedName]
      )
      : await this.db.execute<ExistsRow[]>(
        `SELECT (
           EXISTS(
             SELECT 1
             FROM Ingredients
             WHERE Status = 'active' AND NormalizedName = ?
           )
           OR EXISTS(
             SELECT 1
             FROM IngredientAliases AS alias
             INNER JOIN Ingredients AS ingredient ON ingredient.Id = alias.IngredientId
             WHERE ingredient.Status = 'active' AND alias.NormalizedName = ?
           )
         ) AS \`Exists\``,
        [normalizedName, normalizedName]
      );

    return Boolean(firstOrNull(rows)?.Exists);
  }

  async create(input: CreateCatalogProposalInput): Promise<CatalogProposalWriteResult> {
    let insertId: number;

    try {
      const [result] = await this.db.execute<ResultSetHeader>(
        `INSERT INTO CatalogProposals
           (AuthorUserId, RecipeId, ProposalType, ProposedName, NormalizedName)
         VALUES (?, ?, ?, ?, ?)`,
        [input.authorUserId, input.recipeId, input.proposalType, input.proposedName, input.normalizedName]
      );
      insertId = result.insertId;
    } catch (error) {
      if (isPendingDuplicate(error))
        return { status: 'pending_duplicate' };

      throw error;
    }

    const proposal = await this.findById(insertId);
    if (!proposal)
      throw new Error('Catalog proposal created but cannot be reloaded');

    return { status: 'created', proposal };
  }

  private async findById(id: number) {
    const [rows] = await this.db.execute<CatalogProposalRow[]>(
      `SELECT Id, AuthorUserId, RecipeId, ProposalType, ProposedName, NormalizedName, Status,
              MatchedTagId, MatchedIngredientId, ReviewedByStaffUserId, ReviewReason, CreatedAt, ReviewedAt
       FROM CatalogProposals
       WHERE Id = ?`,
      [id]
    );
    const row = firstOrNull(rows);

    return row ? mapCatalogProposal(row) : null;
  }
}

function isPendingDuplicate(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'ER_DUP_ENTRY'
    && 'message' in error
    && String(error.message).includes('catalog_proposals_pending_recipe_name_UK')
  );
}
