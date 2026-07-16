import { Router } from 'express';

import { CommunityOnly } from '../../middlewares/authorization.js';
import { requireCommunityAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type FavoritesController = {
    createFavorite: RequestHandler;
    deleteFavorite: RequestHandler;
    getFavoriteRecipes: RequestHandler;
};

export function createFavoritesRouter(controller: FavoritesController) {
    const router = Router();

    router.post('/:recipeId', requireCommunityAuth, CommunityOnly, controller.createFavorite);
    router.delete('/:recipeId', requireCommunityAuth, CommunityOnly, controller.deleteFavorite);
    router.get('/me', requireCommunityAuth, controller.getFavoriteRecipes)

    return router;
}
