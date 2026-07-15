import { Router } from 'express';

import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePermission } from '../../middlewares/require-permission.js';
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

    router.get('/moderated', requireAuth, requirePermission(PERMISSIONS.commentsRead), controller.listModeratedComments);
    router.get('/moderated/count', requireAuth, requirePermission(PERMISSIONS.commentsRead), controller.countModeratedComments);
    router.get('/soft-deleted', requireAuth, requirePermission(PERMISSIONS.commentsRead), controller.listSoftDeletedComments);
    router.get('/soft-deleted/count', requireAuth, requirePermission(PERMISSIONS.commentsRead), controller.countSoftDeletedComments);
    router.post('/:id/hide', requireAuth, requirePermission(PERMISSIONS.commentsModerate), controller.hideComment);
    router.post('/:id/unmoderate', requireAuth, requirePermission(PERMISSIONS.commentsModerate), controller.unmoderateComment);
    router.post('/:id/restore', requireAuth, requirePermission(PERMISSIONS.commentsModerate), controller.restoreComment);
    router.patch('/:id', requireAuth, requirePermission(PERMISSIONS.commentsUpdate), controller.updateComment);
    router.delete('/:id', requireAuth, requirePermission(PERMISSIONS.commentsDelete), controller.deleteComment);

    return router;
}
