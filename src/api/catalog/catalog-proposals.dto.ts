import { badRequest } from '../../utils/errors.js';
import { getRequiredPositiveInteger, getRequiredString, isRecord } from '../http/dto.helpers.js';

import type { CreateCatalogProposalCommand } from '../../services/catalog/catalog-proposals.service.js';

export type CreateCatalogProposalBody = Pick<CreateCatalogProposalCommand, 'recipeId' | 'name'>;

const PROPOSAL_NAME_MAX_LENGTH = 255;

export function parseCreateCatalogProposalBody(body: unknown): CreateCatalogProposalBody {
  if (!isRecord(body) || Array.isArray(body))
    throw badRequest('Invalid catalog proposal body', 'CATALOG_PROPOSALS_BAD_BODY');

  const recipeId = getRequiredPositiveInteger(
    body.recipeId,
    'Recipe id must be a positive integer',
    'CATALOG_PROPOSALS_BAD_RECIPE_ID'
  );
  const name = getRequiredString(
    body.name,
    'Proposal name is required',
    'CATALOG_PROPOSALS_NAME_REQUIRED'
  );

  if (name.length > PROPOSAL_NAME_MAX_LENGTH)
    throw badRequest(`Proposal name must be at most ${PROPOSAL_NAME_MAX_LENGTH} characters`, 'CATALOG_PROPOSALS_NAME_TOO_LONG');

  return { recipeId, name };
}
