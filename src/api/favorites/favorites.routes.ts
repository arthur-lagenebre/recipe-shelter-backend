import { Router } from 'express';

import { CommunityOnly } from '../../middlewares/authorization.js';
import { requireAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type FavoritesController = {
    createFavorite: RequestHandler;
    deleteFavorite: RequestHandler;
    getFavoriteRecipes: RequestHandler;
};

export function createFavoritesRouter(controller: FavoritesController) {
    const router = Router();

    router.post('/:recipeId', requireAuth, CommunityOnly, controller.createFavorite);
    router.delete('/:recipeId', requireAuth, CommunityOnly, controller.deleteFavorite);
    router.get('/me', requireAuth, controller.getFavoriteRecipes)

    return router;
}
