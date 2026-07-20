import type { RowDataPacket } from 'mysql2';

export const CATALOG_PROPOSAL_TYPES = ['tag', 'ingredient'] as const;
export const CATALOG_PROPOSAL_STATUSES = ['pending', 'accepted', 'rejected', 'merged'] as const;

export type CatalogProposalType = typeof CATALOG_PROPOSAL_TYPES[number];
export type CatalogProposalStatus = typeof CATALOG_PROPOSAL_STATUSES[number];

export type CatalogProposal = {
  id: number;
  authorUserId: number;
  recipeId: number;
  proposalType: CatalogProposalType;
  proposedName: string;
  normalizedName: string;
  status: CatalogProposalStatus;
  matchedTagId: number | null;
  matchedIngredientId: number | null;
  reviewedByStaffUserId: number | null;
  reviewReason: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
};

export type CreateCatalogProposalInput = {
  authorUserId: number;
  recipeId: number;
  proposalType: CatalogProposalType;
  proposedName: string;
  normalizedName: string;
};

export type CatalogProposalListFilters = {
  status?: CatalogProposalStatus;
  proposalType?: CatalogProposalType;
  recipeId?: number;
  authorUserId?: number;
  q?: string;
};

export type ReviewCatalogProposalInput = {
  proposalId: number;
  status: Exclude<CatalogProposalStatus, 'pending'>;
  matchedTagId: number | null;
  matchedIngredientId: number | null;
  reviewedByStaffUserId: number;
  reviewReason: string;
};

export type CatalogProposalWriteResult =
  | { status: 'created'; proposal: CatalogProposal }
  | { status: 'pending_duplicate' };

export type CatalogProposalRow = RowDataPacket & {
  Id: number;
  AuthorUserId: number;
  RecipeId: number;
  ProposalType: CatalogProposalType;
  ProposedName: string;
  NormalizedName: string;
  Status: CatalogProposalStatus;
  MatchedTagId: number | null;
  MatchedIngredientId: number | null;
  ReviewedByStaffUserId: number | null;
  ReviewReason: string | null;
  CreatedAt: Date;
  ReviewedAt: Date | null;
};
