import { getAdminAuditRequestContext } from './admin.audit.context.js';
import { parseManagedStaffSessionRevocationBody, parseStaffSessionIdParam, parseStaffUserIdParam } from './admin.staff-sessions.dto.js';
import { verifySessionToken } from '../../services/auth/session-token.js';
import { unauthorized } from '../../utils/errors.js';
import { clearSessionCookie, getSessionToken } from '../../utils/session-cookie.js';
import { asyncHandler } from '../http/async-handler.js';

import type { StaffSessionService } from '../../services/auth/staff-session.service.js';
import type { Handler } from '../http/http.types.js';

export function createStaffSessionsController(staffSessions: StaffSessionService) {
    return {
        listOwn: asyncHandler(async (req, res) => {
            const currentSessionId = getCurrentStaffSessionId(req);
            const sessions = await staffSessions.listOwn(req.auth!.userId, currentSessionId);

            res.status(200).json(sessions);
        }),

        revokeOwn: asyncHandler(async (req, res) => {
            const currentSessionId = getCurrentStaffSessionId(req);
            const sessionId = parseStaffSessionIdParam(req.params.sessionId);

            await staffSessions.revokeOwn(req.auth!.userId, sessionId, getAdminAuditRequestContext(req));
            if (sessionId === currentSessionId)
                clearSessionCookie(res, 'admin');

            res.status(204).send();
        }),

        listManaged: asyncHandler(async (req, res) => {
            const currentSessionId = getCurrentStaffSessionId(req);
            const staffUserId = parseStaffUserIdParam(req.params.staffUserId);
            const result = await staffSessions.listManaged(
                staffUserId,
                req.auth!.userId,
                currentSessionId,
                getAdminAuditRequestContext(req)
            );

            res.status(200).json(result);
        }),

        revokeManaged: asyncHandler(async (req, res) => {
            const currentSessionId = getCurrentStaffSessionId(req);
            const staffUserId = parseStaffUserIdParam(req.params.staffUserId);
            const sessionId = parseStaffSessionIdParam(req.params.sessionId);
            const reason = parseManagedStaffSessionRevocationBody(req.body);

            await staffSessions.revokeManaged(staffUserId, sessionId, req.auth!.userId, reason, getAdminAuditRequestContext(req));

            if (staffUserId === req.auth!.userId && sessionId === currentSessionId)
                clearSessionCookie(res, 'admin');

            res.status(204).send();
        })
    };
}

function getCurrentStaffSessionId(req: Parameters<Handler>[0]): string {
    const token = getSessionToken(req, 'admin');

    try {
        const session = token ? verifySessionToken(token, 'admin') : null;

        if (session)
            return session.sessionId;
    } catch {
        // The authentication middleware normally rejects this state first.
    }

    throw unauthorized('Invalid or expired token', 'AUTH_BAD_TOKEN');
}
