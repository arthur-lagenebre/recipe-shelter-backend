import { Router } from 'express';

import { requireAuth } from '../../middlewares/require-auth.js';
import { requireCommunityAccount } from '../../services/auth/authorization.service.js';

import type { RequestHandler } from 'express';

type CommentsController = {
    createComment: RequestHandler;
    updateComment: RequestHandler;
    deleteComment: RequestHandler;
    getRecipeComments: RequestHandler;
};

export function createCommentsRouter(controller: CommentsController) {
    const router = Router();

    router.patch('/:id', requireAuth, requireCommunityAccount, controller.updateComment);
    router.delete('/:id', requireAuth, requireCommunityAccount, controller.deleteComment);

    return router;
}

export function createRecipeCommentsRouter(controller: CommentsController) {
    const router = Router({ mergeParams: true });

    router.get('/', controller.getRecipeComments);
    router.post('/', requireAuth, requireCommunityAccount, controller.createComment);

    return router;
}
