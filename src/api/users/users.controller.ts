import { parseUpdateEmailBody, parseUpdatePasswordBody, parseUpdateUsernameBody, parseUsernameParam } from './users.dto.js';
import { verifySessionToken } from '../../services/auth/session-token.js';
import { getSessionToken } from '../../utils/session-cookie.js';
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

        getUser: asyncHandler(async (req, res) => {
            const username = parseUsernameParam(req.params.username);
            const user = await userService.getUser(username, req.auth?.userId ?? null);

            res.status(200).json(user);
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
            const token = getSessionToken(req, 'app');
            let currentSessionId: string | null = null;

            try {
                const session = token ? verifySessionToken(token, 'app') : null;

                if (session?.userId === req.auth.userId)
                    currentSessionId = session.sessionId;
            } catch {
                currentSessionId = null;
            }

            await userService.updatePassword(req.auth.userId, input.currentPassword, input.newPassword, currentSessionId);

            res.status(200).json({ ok: true, message: 'Password updated successfully.' });
        }),

        updateUsername: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }

            const input = parseUpdateUsernameBody(req.body);
            const profile = await userService.updateUsername(req.auth.userId, input.currentPassword, input.newUsername);

            res.status(200).json({ ok: true, message: 'Username updated successfully.', user: profile });
        })
    };
}
