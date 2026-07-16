import { Router } from 'express';

import { RequirePermission } from '../../middlewares/authorization.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { PERMISSIONS } from '../../security/permissions.js';

import type { RequestHandler } from 'express';

type AdminCommentsController = {
    listModeratedComments: RequestHandler;
    countModeratedComments: RequestHandler;
    listSoftDeletedComments: RequestHandler;
    countSoftDeletedComments: RequestHandler;
    hideComment: RequestHandler;
    unmoderateComment: RequestHandler;
    restoreComment: RequestHandler;
    updateComment: RequestHandler;
    deleteComment: RequestHandler;
};

export function createAdminCommentsRouter(controller: AdminCommentsController) {
    const router = Router();

    router.get('/moderated', requireAuth, RequirePermission(PERMISSIONS.commentsRead), controller.listModeratedComments);
    router.get('/moderated/count', requireAuth, RequirePermission(PERMISSIONS.commentsRead), controller.countModeratedComments);
    router.get('/soft-deleted', requireAuth, RequirePermission(PERMISSIONS.commentsRead), controller.listSoftDeletedComments);
    router.get('/soft-deleted/count', requireAuth, RequirePermission(PERMISSIONS.commentsRead), controller.countSoftDeletedComments);
    router.post('/:id/hide', requireAuth, RequirePermission(PERMISSIONS.commentsModerate), controller.hideComment);
    router.post('/:id/unmoderate', requireAuth, RequirePermission(PERMISSIONS.commentsModerate), controller.unmoderateComment);
    router.post('/:id/restore', requireAuth, RequirePermission(PERMISSIONS.commentsModerate), controller.restoreComment);
    router.patch('/:id', requireAuth, RequirePermission(PERMISSIONS.commentsUpdate), controller.updateComment);
    router.delete('/:id', requireAuth, RequirePermission(PERMISSIONS.commentsDelete), controller.deleteComment);

    return router;
}
