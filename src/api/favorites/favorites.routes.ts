import { Router } from 'express';

import { requireAuth } from '../../middlewares/require-auth.js';
import { requireCommunityAccount } from '../../services/auth/authorization.service.js';

import type { RequestHandler } from 'express';

type FavoritesController = {
    createFavorite: RequestHandler;
    deleteFavorite: RequestHandler;
    getFavoriteRecipes: RequestHandler;
};

export function createFavoritesRouter(controller: FavoritesController) {
    const router = Router();

    router.post('/:recipeId', requireAuth, requireCommunityAccount, controller.createFavorite);
    router.delete('/:recipeId', requireAuth, requireCommunityAccount, controller.deleteFavorite);
    router.get('/me', requireAuth, controller.getFavoriteRecipes)

    return router;
}
