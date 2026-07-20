import { getAdminAuditRequestContext } from './admin.audit.context.js';
import { parseAcceptIngredientCatalogProposalBody, parseAcceptTagCatalogProposalBody, parseAdminCatalogProposalIdParam, parseAdminCatalogProposalListFilters, parseAssociateIngredientCatalogProposalBody, parseAssociateTagCatalogProposalBody, parseConvertCatalogProposalToAliasBody, parseRejectCatalogProposalBody } from './admin.catalog-proposals.dto.js';
import { parsePaginationQuery } from '../../utils/pagination.js';
import { asyncHandler } from '../http/async-handler.js';

import type { AdminCatalogProposalService } from '../../services/admin/admin.catalog-proposals.service.js';

const DEFAULT_ADMIN_CATALOG_PROPOSAL_LIMIT = 25;

export function createAdminCatalogProposalsController(proposals: AdminCatalogProposalService) {
  return {
    list: asyncHandler(async (req, res) => {
      const filters = parseAdminCatalogProposalListFilters(req.query);
      const pagination = parsePaginationQuery(
        req.query,
        DEFAULT_ADMIN_CATALOG_PROPOSAL_LIMIT,
        'ADMIN_CATALOG_PROPOSALS_PAGINATION'
      );
      const result = await proposals.list(filters, pagination, req.auth!.userId, getAdminAuditRequestContext(req));

      res.status(200).json(result);
    }),

    acceptTag: asyncHandler(async (req, res) => {
      const proposalId = parseAdminCatalogProposalIdParam(req.params.id);
      const input = parseAcceptTagCatalogProposalBody(req.body);
      const proposal = await proposals.acceptTag(proposalId, input, req.auth!.userId, getAdminAuditRequestContext(req));

      res.status(201).json(proposal);
    }),

    acceptIngredient: asyncHandler(async (req, res) => {
      const proposalId = parseAdminCatalogProposalIdParam(req.params.id);
      const input = parseAcceptIngredientCatalogProposalBody(req.body);
      const proposal = await proposals.acceptIngredient(proposalId, input, req.auth!.userId, getAdminAuditRequestContext(req));

      res.status(201).json(proposal);
    }),

    reject: asyncHandler(async (req, res) => {
      const proposalId = parseAdminCatalogProposalIdParam(req.params.id);
      const reason = parseRejectCatalogProposalBody(req.body);
      const proposal = await proposals.reject(proposalId, reason, req.auth!.userId, getAdminAuditRequestContext(req));

      res.status(200).json(proposal);
    }),

    associateTag: asyncHandler(async (req, res) => {
      const proposalId = parseAdminCatalogProposalIdParam(req.params.id);
      const input = parseAssociateTagCatalogProposalBody(req.body);
      const proposal = await proposals.associateTag(proposalId, input, req.auth!.userId, getAdminAuditRequestContext(req));

      res.status(200).json(proposal);
    }),

    associateIngredient: asyncHandler(async (req, res) => {
      const proposalId = parseAdminCatalogProposalIdParam(req.params.id);
      const input = parseAssociateIngredientCatalogProposalBody(req.body);
      const proposal = await proposals.associateIngredient(proposalId, input, req.auth!.userId, getAdminAuditRequestContext(req));

      res.status(200).json(proposal);
    }),

    convertIngredientToAlias: asyncHandler(async (req, res) => {
      const proposalId = parseAdminCatalogProposalIdParam(req.params.id);
      const input = parseConvertCatalogProposalToAliasBody(req.body);
      const proposal = await proposals.convertIngredientToAlias(
        proposalId,
        input,
        req.auth!.userId,
        getAdminAuditRequestContext(req)
      );

      res.status(201).json(proposal);
    })
  };
}
