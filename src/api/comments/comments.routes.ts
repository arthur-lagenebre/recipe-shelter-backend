import { Router } from 'express';

import { CommunityOnly } from '../../middlewares/authorization.js';
import { requireAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type CommentsController = {
    createComment: RequestHandler;
    updateComment: RequestHandler;
    deleteComment: RequestHandler;
    getRecipeComments: RequestHandler;
};

export function createCommentsRouter(controller: CommentsController) {
    const router = Router();

    router.patch('/:id', requireAuth, CommunityOnly, controller.updateComment);
    router.delete('/:id', requireAuth, CommunityOnly, controller.deleteComment);

    return router;
}

export function createRecipeCommentsRouter(controller: CommentsController) {
    const router = Router({ mergeParams: true });

    router.get('/', controller.getRecipeComments);
    router.post('/', requireAuth, CommunityOnly, controller.createComment);

    return router;
}
