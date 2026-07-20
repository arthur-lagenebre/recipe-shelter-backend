import { getAdminAuditRequestContext } from './admin.audit.context.js';
import { parseAdminTagActionReasonBody, parseAdminTagIdParam, parseAdminTagListFilters, parseCreateAdminTagBody, parseMergeAdminTagBody, parseUpdateAdminTagBody } from './admin.tags.dto.js';
import { parsePaginationQuery } from '../../utils/pagination.js';
import { asyncHandler } from '../http/async-handler.js';

import type { AdminTagService } from '../../services/admin/admin.tags.service.js';

const DEFAULT_ADMIN_TAG_LIMIT = 25;

export function createAdminTagsController(tags: AdminTagService) {
  return {
    list: asyncHandler(async (req, res) => {
      const filters = parseAdminTagListFilters(req.query);
      const pagination = parsePaginationQuery(req.query, DEFAULT_ADMIN_TAG_LIMIT, 'ADMIN_TAGS_PAGINATION');
      const result = await tags.list(filters, pagination, req.auth!.userId, getAdminAuditRequestContext(req));

      res.status(200).json(result);
    }),

    create: asyncHandler(async (req, res) => {
      const input = parseCreateAdminTagBody(req.body);
      const tag = await tags.create(input, req.auth!.userId, getAdminAuditRequestContext(req));

      res.status(201).json(tag);
    }),

    update: asyncHandler(async (req, res) => {
      const tagId = parseAdminTagIdParam(req.params.id);
      const input = parseUpdateAdminTagBody(req.body);
      const tag = await tags.update(tagId, input, req.auth!.userId, getAdminAuditRequestContext(req));

      res.status(200).json(tag);
    }),

    deprecate: asyncHandler(async (req, res) => {
      const tagId = parseAdminTagIdParam(req.params.id);
      const reason = parseAdminTagActionReasonBody(req.body, 'deprecate');
      const tag = await tags.deprecate(tagId, reason, req.auth!.userId, getAdminAuditRequestContext(req));

      res.status(200).json(tag);
    }),

    restore: asyncHandler(async (req, res) => {
      const tagId = parseAdminTagIdParam(req.params.id);
      const reason = parseAdminTagActionReasonBody(req.body, 'restore');
      const tag = await tags.restore(tagId, reason, req.auth!.userId, getAdminAuditRequestContext(req));

      res.status(200).json(tag);
    }),

    merge: asyncHandler(async (req, res) => {
      const tagId = parseAdminTagIdParam(req.params.id);
      const input = parseMergeAdminTagBody(req.body);
      const tag = await tags.merge(tagId, input, req.auth!.userId, getAdminAuditRequestContext(req));

      res.status(200).json(tag);
    })
  };
}
