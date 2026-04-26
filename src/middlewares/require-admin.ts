import { forbidden } from '../utils/errors.js';

import type { RequestHandler } from 'express';


export const requireAdmin: RequestHandler = (req, _res, next) => {
    if (req.auth?.roleId !== 1)
        return next(forbidden('Admin access required', 'ADMIN_ACCESS_REQUIRED'));

    next();
};