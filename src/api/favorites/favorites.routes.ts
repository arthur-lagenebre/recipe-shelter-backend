import { Router } from 'express';

import { requireAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type FavoritesController = {
    createFavorite: RequestHandler;
    deleteFavorite: RequestHandler;
    getFavoriteRecipes: RequestHandler;
};

export function createFavoritesRouter(controller: FavoritesController) {
    const router = Router();

    router.post('/create', requireAuth, controller.createFavorite);
    router.post('/delete', requireAuth, controller.deleteFavorite);
    router.get('/me', requireAuth, controller.getFavoriteRecipes)

    return router;
}