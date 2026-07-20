import { parseCreateCatalogProposalBody } from './catalog-proposals.dto.js';
import { asyncHandler } from '../http/async-handler.js';

import type { CatalogProposalService } from '../../services/catalog/catalog-proposals.service.js';

export function createCatalogProposalsController(catalogProposalService: CatalogProposalService) {
  return {
    createTagProposal: asyncHandler(async (req, res) => {
      const body = parseCreateCatalogProposalBody(req.body);
      const proposal = await catalogProposalService.createTagProposal({
        authorUserId: req.auth!.userId,
        ...body
      });

      res.status(201).json(proposal);
    }),

    createIngredientProposal: asyncHandler(async (req, res) => {
      const body = parseCreateCatalogProposalBody(req.body);
      const proposal = await catalogProposalService.createIngredientProposal({
        authorUserId: req.auth!.userId,
        ...body
      });

      res.status(201).json(proposal);
    })
  };
}
