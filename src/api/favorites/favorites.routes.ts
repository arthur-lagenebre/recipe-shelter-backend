import { Router } from 'express';

import { requireAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type FavoritesController = {
    createFavorite: RequestHandler;
    deleteFavorite: RequestHandler;
};

export function createFavoritesRouter(controller: FavoritesController) {
    const router = Router();

    router.post('/create', requireAuth, controller.createFavorite);
    router.post('/delete', requireAuth, controller.deleteFavorite);

    return router;
}