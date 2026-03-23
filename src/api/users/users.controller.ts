import { createPool } from 'mysql2/promise';

import { parseUpdateEmailBody, parseUpdatePasswordBody } from './users.dto.js';
import { UserRepositoryMysql } from '../../repositories/users/user-repository.mysql.js';
import { UserService } from '../../services/users/users.service.js';
import { env } from '../../utils/env.js';
import { asyncHandler } from '../http/async-handler.js';

const db = createPool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
    connectionLimit: env.db.connectionLimit,
});

const userRepository = new UserRepositoryMysql(db);
const userService = new UserService(userRepository);

export const usersController = {
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