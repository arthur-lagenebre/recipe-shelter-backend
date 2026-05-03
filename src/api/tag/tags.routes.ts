import { Router } from 'express';

import { requireAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type TagsController = {
    getTags: RequestHandler;
    getTag: RequestHandler;
};

export function createTagssRouter(controller: TagsController) {
    const router = Router();

    router.get('/', requireAuth, controller.getTags);
    router.get('/:id', requireAuth, controller.getTag);

    return router;
}