import { Router } from 'express';

import { isPermissionCode } from '../security/permissions.js';
import { hasPermission, isCommunityAccount, isStaffAccount } from '../services/auth/authorization.service.js';
import { forbidden } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

import type { PermissionCode } from '../security/permissions.js';
import type { NextFunction, Request, RequestHandler } from 'express';

type PolicyMethod = 'delete' | 'get' | 'patch' | 'post' | 'put';

export type AuthorizationPolicy = Readonly<{
    method: PolicyMethod;
    path: string;
    permission: PermissionCode;
}>;

function denyPolicy(
    req: Request,
    next: NextFunction,
    message: string,
    code: string,
    reason: 'policy_missing' | 'permission_unknown',
    permission?: unknown
) {
    logger.warn('[authz] Administrative request denied', {
        code,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        permission,
        reason,
        userId: req.auth?.userId ?? null
    });

    return next(forbidden(message, code));
}

export const CommunityOnly: RequestHandler = (req, _res, next) => {
    if (!isCommunityAccount(req.auth))
        return next(forbidden('Active community account is required', 'AUTH_COMMUNITY_ACCOUNT_REQUIRED'));

    return next();
};

export const StaffOnly: RequestHandler = (req, _res, next) => {
    if (!isStaffAccount(req.auth))
        return next(forbidden('Active staff account is required', 'AUTH_STAFF_ACCOUNT_REQUIRED'));

    return next();
};

export function RequirePermission(permission: PermissionCode): RequestHandler {
    return (req, _res, next) => {
        if (!hasPermission(req.auth, permission))
            return next(forbidden('Required permission is missing', 'AUTH_PERMISSION_REQUIRED'));

        return next();
    };
}

export function EnforceAuthorizationPolicies(policies: readonly AuthorizationPolicy[]): RequestHandler {
    const policyRouter = Router();

    for (const policy of policies) {
        policyRouter[policy.method](policy.path, (req, _res, next) => {
            if (!isPermissionCode(policy.permission)) {
                return denyPolicy(
                    req,
                    next,
                    'Administrative authorization policy references an unknown permission',
                    'AUTH_PERMISSION_UNKNOWN',
                    'permission_unknown',
                    policy.permission
                );
            }

            if (!hasPermission(req.auth, policy.permission))
                return next(forbidden('Required permission is missing', 'AUTH_PERMISSION_REQUIRED'));

            return next('router');
        });
    }

    policyRouter.use((req, _res, next) =>
        denyPolicy(req, next, 'Administrative authorization policy is required', 'AUTH_POLICY_REQUIRED', 'policy_missing')
    );

    return policyRouter;
}
