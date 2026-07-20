import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { normalizeIngredientName } from '../ingredients/ingredients.service.js';
import { normalizeTagName } from '../tag/tags.service.js';

import type { CatalogProposalRepository } from '../../repositories/catalog/catalog-proposals.repository.interface.js';
import type { CatalogProposal, CatalogProposalType } from '../../repositories/catalog/catalog-proposals.types.js';

const PROPOSAL_NAME_MAX_LENGTH = 255;

export type CreateCatalogProposalCommand = {
  authorUserId: number;
  recipeId: number;
  name: string;
};

export class CatalogProposalService {
  constructor(private readonly proposals: CatalogProposalRepository) { }

  createTagProposal(input: CreateCatalogProposalCommand): Promise<CatalogProposal> {
    return this.create('tag', input);
  }

  createIngredientProposal(input: CreateCatalogProposalCommand): Promise<CatalogProposal> {
    return this.create('ingredient', input);
  }

  private async create(proposalType: CatalogProposalType, input: CreateCatalogProposalCommand): Promise<CatalogProposal> {
    const command = validateCommand(proposalType, input);

    if (!await this.proposals.recipeExistsForAuthor(command.recipeId, command.authorUserId))
      throw notFound('Recipe not found', 'CATALOG_PROPOSALS_RECIPE_NOT_FOUND');

    if (await this.proposals.activeCatalogNameExists(proposalType, command.normalizedName))
      throw conflict('An active catalogue entry already uses this name', 'CATALOG_PROPOSALS_CANONICAL_NAME_EXISTS');

    const result = await this.proposals.create({ proposalType, ...command });
    if (result.status === 'pending_duplicate')
      throw conflict('An equivalent proposal is already pending for this recipe', 'CATALOG_PROPOSALS_ALREADY_PENDING');

    return result.proposal;
  }
}

function validateCommand(proposalType: CatalogProposalType, input: CreateCatalogProposalCommand) {
  if (!input || typeof input !== 'object')
    throw badRequest('Invalid catalog proposal', 'CATALOG_PROPOSALS_BAD_BODY');

  const authorUserId = requirePositiveId(input.authorUserId, 'Authenticated user id', 'CATALOG_PROPOSALS_BAD_AUTHOR_ID');
  const recipeId = requirePositiveId(input.recipeId, 'Recipe id', 'CATALOG_PROPOSALS_BAD_RECIPE_ID');
  const proposedName = typeof input.name === 'string' ? input.name.trim() : '';

  if (!proposedName)
    throw badRequest('Proposal name is required', 'CATALOG_PROPOSALS_NAME_REQUIRED');
  if (proposedName.length > PROPOSAL_NAME_MAX_LENGTH)
    throw badRequest(`Proposal name must be at most ${PROPOSAL_NAME_MAX_LENGTH} characters`, 'CATALOG_PROPOSALS_NAME_TOO_LONG');

  const normalizedName = proposalType === 'tag'
    ? normalizeTagName(proposedName)
    : normalizeIngredientName(proposedName);

  if (!normalizedName)
    throw badRequest('Proposal name must contain canonical letters or numbers', 'CATALOG_PROPOSALS_NAME_INVALID');
  if (normalizedName.length > PROPOSAL_NAME_MAX_LENGTH)
    throw badRequest(`Normalized proposal name must be at most ${PROPOSAL_NAME_MAX_LENGTH} characters`, 'CATALOG_PROPOSALS_NAME_TOO_LONG');

  return { authorUserId, recipeId, proposedName, normalizedName };
}

function requirePositiveId(value: unknown, label: string, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0)
    throw badRequest(`${label} must be a positive integer`, code);

  return Number(value);
}
