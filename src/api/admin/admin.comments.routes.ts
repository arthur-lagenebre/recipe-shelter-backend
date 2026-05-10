import { Router } from 'express';

import { requireAdmin } from '../../middlewares/require-admin.js';
import { requireAuth } from '../../middlewares/require-auth.js';

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

    router.get('/moderated', requireAuth, requireAdmin, controller.listModeratedComments);
    router.get('/moderated/count', requireAuth, requireAdmin, controller.countModeratedComments);
    router.get('/soft-deleted', requireAuth, requireAdmin, controller.listSoftDeletedComments);
    router.get('/soft-deleted/count', requireAuth, requireAdmin, controller.countSoftDeletedComments);
    router.post('/:id/hide', requireAuth, requireAdmin, controller.hideComment);
    router.post('/:id/unmoderate', requireAuth, requireAdmin, controller.unmoderateComment);
    router.post('/:id/restore', requireAuth, requireAdmin, controller.restoreComment);
    router.patch('/:id', requireAuth, requireAdmin, controller.updateComment);
    router.delete('/:id', requireAuth, requireAdmin, controller.deleteComment);

    return router;
}
