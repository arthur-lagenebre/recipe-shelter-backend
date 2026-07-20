import { getAdminAuditRequestContext } from './admin.audit.context.js';
import { parseAdminUserIdParam, parseBanUserBody, parseUnbanUserBody } from './admin.users.dto.js';
import { asyncHandler } from '../http/async-handler.js';

import type { AdminUserService } from '../../services/admin/admin.users.service.js';

export function createAdminUsersController(adminUserService: AdminUserService) {
    return {
        listBannedUsers: asyncHandler(async (_req, res) => {
            const users = await adminUserService.getBannedUsersForAdmin();

            res.status(200).json(users);
        }),

        countBannedUsers: asyncHandler(async (_req, res) => {
            const count = await adminUserService.getCountBannedUsersForAdmin();

            res.status(200).json({ bannedUsers: count });
        }),

        getUserProfile: asyncHandler(async (req, res) => {
            const userId = parseAdminUserIdParam(req.params.id);
            const user = await adminUserService.getAdminUserProfile(userId);

            res.status(200).json(user);
        }),

        banUser: asyncHandler(async (req, res) => {
            const userId = parseAdminUserIdParam(req.params.id);
            const reason = parseBanUserBody(req.body);
            const result = await adminUserService.ban(userId, req.auth!.userId, reason, getAdminAuditRequestContext(req));

            res.status(200).json({ ok: result });
        }),

        unbanUser: asyncHandler(async (req, res) => {
            const userId = parseAdminUserIdParam(req.params.id);
            const reason = parseUnbanUserBody(req.body);
            const result = await adminUserService.unban(userId, req.auth!.userId, reason, getAdminAuditRequestContext(req));

            res.status(200).json({ ok: result });
        })
    };
}
