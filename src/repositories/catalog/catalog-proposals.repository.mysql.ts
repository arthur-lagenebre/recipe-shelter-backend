import { mapCatalogProposal } from './catalog-proposals.mapper.js';
import { firstOrNull } from '../../utils/array.js';
import { createPaginatedResult, formatLimitOffsetClause } from '../../utils/pagination.js';

import type { AdminCatalogProposalRepository, CatalogProposalRepository } from './catalog-proposals.repository.interface.js';
import type {
    CatalogProposal,
    CatalogProposalListFilters,
    CatalogProposalRow,
    CatalogProposalType,
    CatalogProposalWriteResult,
    CreateCatalogProposalInput,
    ReviewCatalogProposalInput
} from './catalog-proposals.types.js';
import type { PaginatedResult, PaginationOptions } from '../../utils/pagination.js';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { Pool, PoolConnection } from 'mysql2/promise';

type ExistsRow = RowDataPacket & {
    Exists: number;
};

type CountRow = RowDataPacket & {
    Count: number | string;
};

type ProposalWhere = {
    clause: string;
    params: Array<number | string>;
};

const CATALOG_PROPOSAL_SELECT = `cp.Id, cp.AuthorUserId, cp.RecipeId, cp.ProposalType,
                                 cp.ProposedName, cp.NormalizedName, cp.Status,
                                 cp.MatchedTagId, cp.MatchedIngredientId, cp.MatchedEquipmentId,
                                 cp.ReviewedByStaffUserId, cp.ReviewReason,
                                 cp.CreatedAt, cp.ReviewedAt`;

export class CatalogProposalRepositoryMysql implements CatalogProposalRepository, AdminCatalogProposalRepository {
    constructor(private readonly db: Pool) {}

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

    async activeCatalogNameExists(proposalType: CatalogProposalType, normalizedName: string, db?: PoolConnection): Promise<boolean> {
        const executor = db ?? this.db;

        if (proposalType === 'tag') {
            const [rows] = await executor.execute<ExistsRow[]>(
                `SELECT EXISTS(
                    SELECT 1
                    FROM Tags
                    WHERE Status = 'active' AND NormalizedName = ?
                ) AS \`Exists\``,
                [normalizedName]
            );

            return Boolean(firstOrNull(rows)?.Exists);
        }

        if (proposalType === 'equipment') {
            const [rows] = await executor.execute<ExistsRow[]>(
                `SELECT EXISTS(
                    SELECT 1
                    FROM Equipments
                    WHERE NormalizedName = ?
                ) AS \`Exists\``,
                [normalizedName]
            );

            return Boolean(firstOrNull(rows)?.Exists);
        }

        const [rows] = await executor.execute<ExistsRow[]>(
            `SELECT (
                EXISTS(SELECT 1 FROM Ingredients WHERE Status = 'active' AND NormalizedName = ?)
                OR EXISTS(SELECT 1 FROM IngredientAliases AS alias INNER JOIN Ingredients AS ingredient ON ingredient.Id = alias.IngredientId WHERE ingredient.Status = 'active' AND alias.NormalizedName = ?)
            ) AS \`Exists\``,
            [normalizedName, normalizedName]
        );

        return Boolean(firstOrNull(rows)?.Exists);
    }

    async create(input: CreateCatalogProposalInput): Promise<CatalogProposalWriteResult> {
        let insertId: number;

        try {
            const [result] = await this.db.execute<ResultSetHeader>(
                `INSERT INTO CatalogProposals (AuthorUserId, RecipeId, ProposalType, ProposedName, NormalizedName) VALUES (?, ?, ?, ?, ?)`,
                [input.authorUserId, input.recipeId, input.proposalType, input.proposedName, input.normalizedName]
            );
            insertId = result.insertId;
        } catch (error) {
            if (isPendingDuplicate(error)) return { status: 'pending_duplicate' };

            throw error;
        }

        const proposal = await this.findById(insertId);
        if (!proposal) throw new Error('Catalog proposal created but cannot be reloaded');

        return { status: 'created', proposal };
    }

    async find(
        filters: CatalogProposalListFilters,
        pagination: PaginationOptions,
        db?: PoolConnection
    ): Promise<PaginatedResult<CatalogProposal>> {
        const executor = db ?? this.db;
        const where = buildWhere(filters);
        const [countRows] = await executor.execute<CountRow[]>(
            `SELECT COUNT(*) AS Count
             FROM CatalogProposals AS cp
             WHERE ${where.clause}`,
            where.params
        );
        const [rows] = await executor.execute<CatalogProposalRow[]>(
            `SELECT ${CATALOG_PROPOSAL_SELECT}
             FROM CatalogProposals AS cp
             WHERE ${where.clause}
             ORDER BY cp.CreatedAt ASC, cp.Id ASC
            ${formatLimitOffsetClause(pagination)}`,
            where.params
        );

        return createPaginatedResult(rows.map(mapCatalogProposal), Number(firstOrNull(countRows)?.Count ?? 0), pagination);
    }

    async findByIdForUpdate(proposalId: number, db: PoolConnection): Promise<CatalogProposal | null> {
        return this.findById(proposalId, db, true);
    }

    async review(input: ReviewCatalogProposalInput, db: PoolConnection): Promise<CatalogProposal | null> {
        const [result] = await db.execute<ResultSetHeader>(
            `UPDATE CatalogProposals SET Status = ?, MatchedTagId = ?, MatchedIngredientId = ?, MatchedEquipmentId = ?, ReviewedByStaffUserId = ?, ReviewReason = ?, ReviewedAt = CURRENT_TIMESTAMP(6) WHERE Id = ? AND Status = 'pending'`,
            [
                input.status,
                input.matchedTagId,
                input.matchedIngredientId,
                input.matchedEquipmentId,
                input.reviewedByStaffUserId,
                input.reviewReason,
                input.proposalId
            ]
        );

        if (result.affectedRows === 0) return null;

        return this.findById(input.proposalId, db);
    }

    private async findById(id: number, db: Pool | PoolConnection = this.db, forUpdate = false) {
        const [rows] = await db.execute<CatalogProposalRow[]>(
            `SELECT ${CATALOG_PROPOSAL_SELECT}
             FROM CatalogProposals AS cp
             WHERE cp.Id = ?
            ${forUpdate ? 'FOR UPDATE' : ''}`,
            [id]
        );
        const row = firstOrNull(rows);

        return row ? mapCatalogProposal(row) : null;
    }
}

function buildWhere(filters: CatalogProposalListFilters): ProposalWhere {
    const clauses = ['1 = 1'];
    const params: Array<number | string> = [];

    if (filters.status !== undefined) {
        clauses.push('cp.Status = ?');
        params.push(filters.status);
    }
    if (filters.proposalType !== undefined) {
        clauses.push('cp.ProposalType = ?');
        params.push(filters.proposalType);
    }
    if (filters.recipeId !== undefined) {
        clauses.push('cp.RecipeId = ?');
        params.push(filters.recipeId);
    }
    if (filters.authorUserId !== undefined) {
        clauses.push('cp.AuthorUserId = ?');
        params.push(filters.authorUserId);
    }
    if (filters.q !== undefined) {
        clauses.push('(INSTR(cp.ProposedName, ?) > 0 OR INSTR(cp.NormalizedName, ?) > 0)');
        params.push(filters.q, filters.q);
    }

    return { clause: clauses.join(' AND '), params };
}

function isPendingDuplicate(error: unknown): boolean {
    return Boolean(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ER_DUP_ENTRY' &&
        'message' in error &&
        String(error.message).includes('catalog_proposals_pending_recipe_name_UK')
    );
}
