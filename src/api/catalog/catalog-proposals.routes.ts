import { Router } from 'express';

import { CommunityOnly } from '../../middlewares/authorization.js';
import { rateLimiter } from '../../middlewares/rate-limiter.js';
import { requireCommunityAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type CatalogProposalsController = {
  createTagProposal: RequestHandler;
  createIngredientProposal: RequestHandler;
};

export const CATALOG_PROPOSALS_RATE_LIMIT_MAX_ATTEMPTS = 10;
export const CATALOG_PROPOSALS_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export function createCatalogProposalsRouter(controller: CatalogProposalsController) {
  const router = Router();
  const proposalRateLimiter = rateLimiter(
    CATALOG_PROPOSALS_RATE_LIMIT_MAX_ATTEMPTS,
    CATALOG_PROPOSALS_RATE_LIMIT_WINDOW_MS
  );

  router.post('/tag-proposals', requireCommunityAuth, CommunityOnly, proposalRateLimiter, controller.createTagProposal);
  router.post('/ingredient-proposals', requireCommunityAuth, CommunityOnly, proposalRateLimiter, controller.createIngredientProposal);

  return router;
}
