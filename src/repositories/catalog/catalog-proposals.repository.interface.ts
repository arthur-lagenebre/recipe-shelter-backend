import type { CatalogProposalType, CatalogProposalWriteResult, CreateCatalogProposalInput } from './catalog-proposals.types.js';

export interface CatalogProposalRepository {
  recipeExistsForAuthor(recipeId: number, authorUserId: number): Promise<boolean>;
  activeCatalogNameExists(proposalType: CatalogProposalType, normalizedName: string): Promise<boolean>;
  create(input: CreateCatalogProposalInput): Promise<CatalogProposalWriteResult>;
}
