import type { CatalogProposal, CatalogProposalRow } from './catalog-proposals.types.js';

export function mapCatalogProposal(row: CatalogProposalRow): CatalogProposal {
    return {
        id: Number(row.Id),
        authorUserId: Number(row.AuthorUserId),
        recipeId: Number(row.RecipeId),
        proposalType: row.ProposalType,
        proposedName: row.ProposedName,
        normalizedName: row.NormalizedName,
        status: row.Status,
        matchedTagId: row.MatchedTagId === null ? null : Number(row.MatchedTagId),
        matchedIngredientId: row.MatchedIngredientId === null ? null : Number(row.MatchedIngredientId),
        matchedEquipmentId: row.MatchedEquipmentId === null ? null : Number(row.MatchedEquipmentId),
        reviewedByStaffUserId: row.ReviewedByStaffUserId === null ? null : Number(row.ReviewedByStaffUserId),
        reviewReason: row.ReviewReason,
        createdAt: row.CreatedAt,
        reviewedAt: row.ReviewedAt
    };
}
