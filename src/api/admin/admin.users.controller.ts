import { parseAdminUserIdParam, parseBanUserBody } from './admin.users.dto.js';
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

        banUser: asyncHandler(async (req, res) => {
            const userId = parseAdminUserIdParam(req.params.id);
            const reason = parseBanUserBody(req.body);
            const result = await adminUserService.ban(userId, req.auth!.userId, reason);

            res.status(200).json({ ok: result });
        }),

        unbanUser: asyncHandler(async (req, res) => {
            const userId = parseAdminUserIdParam(req.params.id);
            const result = await adminUserService.unban(userId);

            res.status(200).json({ ok: result });
        })
    };
}
