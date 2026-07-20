import { Router } from 'express';

import { RequirePermission } from '../../middlewares/authorization.js';
import { requireStaffAuth } from '../../middlewares/require-auth.js';
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

    router.get('/moderated', requireStaffAuth, RequirePermission(PERMISSIONS.commentReview), controller.listModeratedComments);
    router.get('/moderated/count', requireStaffAuth, RequirePermission(PERMISSIONS.commentReview), controller.countModeratedComments);
    router.get('/soft-deleted', requireStaffAuth, RequirePermission(PERMISSIONS.commentReview), controller.listSoftDeletedComments);
    router.get('/soft-deleted/count', requireStaffAuth, RequirePermission(PERMISSIONS.commentReview), controller.countSoftDeletedComments);
    router.post('/:id/hide', requireStaffAuth, RequirePermission(PERMISSIONS.commentHide), controller.hideComment);
    router.post('/:id/unmoderate', requireStaffAuth, RequirePermission(PERMISSIONS.commentRestore), controller.unmoderateComment);
    router.post('/:id/restore', requireStaffAuth, RequirePermission(PERMISSIONS.commentRestore), controller.restoreComment);
    router.patch('/:id', requireStaffAuth, RequirePermission(PERMISSIONS.commentsUpdate), controller.updateComment);
    router.delete('/:id', requireStaffAuth, RequirePermission(PERMISSIONS.commentsDelete), controller.deleteComment);

    return router;
}
