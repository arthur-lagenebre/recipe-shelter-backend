import { Router } from 'express';

import type { RequestHandler } from 'express';

type TagsController = {
    getTags: RequestHandler;
    getTag: RequestHandler;
};

export function createTagsRouter(controller: TagsController) {
    const router = Router();

    router.get('/', controller.getTags);
    router.get('/:id', controller.getTag);

    return router;
}