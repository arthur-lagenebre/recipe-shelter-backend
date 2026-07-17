import { getAdminAuditRequestContext } from './admin-audit.context.js';
import { parseAdminStaffRoleCodeParam, parseAdminStaffUserIdParam, parseStaffActionReasonBody } from './admin.staff.dto.js';
import { asyncHandler } from '../http/async-handler.js';

import type { AdminStaffService } from '../../services/admin/admin.staff.service.js';

export function createAdminStaffController(staff: AdminStaffService) {
  return {
    list: asyncHandler(async (req, res) => {
      const accounts = await staff.list(req.auth!.userId, getAdminAuditRequestContext(req));

      res.status(200).json({ staff: accounts });
    }),

    get: asyncHandler(async (req, res) => {
      const staffUserId = parseAdminStaffUserIdParam(req.params.staffUserId);
      const account = await staff.get(staffUserId, req.auth!.userId, getAdminAuditRequestContext(req));

      res.status(200).json(account);
    }),

    disable: asyncHandler(async (req, res) => {
      const staffUserId = parseAdminStaffUserIdParam(req.params.staffUserId);
      const reason = parseStaffActionReasonBody(req.body, 'disable');
      const account = await staff.disable(staffUserId, req.auth!.userId, reason, getAdminAuditRequestContext(req));

      res.status(200).json(account);
    }),

    enable: asyncHandler(async (req, res) => {
      const staffUserId = parseAdminStaffUserIdParam(req.params.staffUserId);
      const reason = parseStaffActionReasonBody(req.body, 'enable');
      const account = await staff.enable(staffUserId, req.auth!.userId, reason, getAdminAuditRequestContext(req));

      res.status(200).json(account);
    }),

    grantRole: asyncHandler(async (req, res) => {
      const staffUserId = parseAdminStaffUserIdParam(req.params.staffUserId);
      const roleCode = parseAdminStaffRoleCodeParam(req.params.roleCode);
      const reason = parseStaffActionReasonBody(req.body, 'role_grant');
      const account = await staff.grantRole(staffUserId, roleCode, req.auth!.userId, reason, getAdminAuditRequestContext(req));

      res.status(200).json(account);
    }),

    revokeRole: asyncHandler(async (req, res) => {
      const staffUserId = parseAdminStaffUserIdParam(req.params.staffUserId);
      const roleCode = parseAdminStaffRoleCodeParam(req.params.roleCode);
      const reason = parseStaffActionReasonBody(req.body, 'role_revoke');
      const account = await staff.revokeRole(staffUserId, roleCode, req.auth!.userId, reason, getAdminAuditRequestContext(req));

      res.status(200).json(account);
    })
  };
}

