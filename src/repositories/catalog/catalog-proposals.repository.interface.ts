import type {
    CatalogProposal,
    CatalogProposalListFilters,
    CatalogProposalType,
    CatalogProposalWriteResult,
    CreateCatalogProposalInput,
    ReviewCatalogProposalInput
} from './catalog-proposals.types.js';
import type { PaginatedResult, PaginationOptions } from '../../utils/pagination.js';
import type { PoolConnection } from 'mysql2/promise';

export interface CatalogProposalRepository {
    recipeExistsForAuthor(recipeId: number, authorUserId: number): Promise<boolean>;
    activeCatalogNameExists(proposalType: CatalogProposalType, normalizedName: string): Promise<boolean>;
    create(input: CreateCatalogProposalInput): Promise<CatalogProposalWriteResult>;
}

export interface AdminCatalogProposalRepository {
    find(
        filters: CatalogProposalListFilters,
        pagination: PaginationOptions,
        db?: PoolConnection
    ): Promise<PaginatedResult<CatalogProposal>>;
    findByIdForUpdate(proposalId: number, db: PoolConnection): Promise<CatalogProposal | null>;
    activeCatalogNameExists(proposalType: CatalogProposalType, normalizedName: string, db?: PoolConnection): Promise<boolean>;
    review(input: ReviewCatalogProposalInput, db: PoolConnection): Promise<CatalogProposal | null>;
}
