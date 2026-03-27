import { parseUpdateEmailBody, parseUpdatePasswordBody } from './users.dto.js';
import { asyncHandler } from '../http/async-handler.js';

import type { UserService } from '../../services/users/users.service.js';

export function createUsersController(userService: UserService) {
    return {
        me: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }

            const profile = await userService.getMe(req.auth.userId);
            res.status(200).json(profile);
        }),

        updateEmail: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });
                return;
            }

            const input = parseUpdateEmailBody(req.body);

            const profile = await userService.updateEmail(req.auth.userId, input.newEmail, input.currentPassword);

            res.status(200).json({ ok: true, message: 'Email updated successfully.', user: profile });
        }),

        updatePassword: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }

            const input = parseUpdatePasswordBody(req.body);

            await userService.updatePassword(req.auth.userId, input.currentPassword, input.newPassword);

            res.status(200).json({ ok: true, message: 'Password updated successfully.' });
        }),
    };
}
