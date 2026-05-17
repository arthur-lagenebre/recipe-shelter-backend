import { parseRecipeIdParam } from './favorites.dto.js';
import { parsePaginationQuery } from '../../utils/pagination.js';
import { asyncHandler } from '../http/async-handler.js';

import type { FavoriteService } from '../../services/favorites/favorites.service.js';

export function createFavoritesController(favoriteService: FavoriteService) {
    return {
        createFavorite: asyncHandler(async (req, res) => {
            const recipeId = parseRecipeIdParam(req.params.recipeId);
            const favorite = await favoriteService.createFavorite(req.auth!.userId, recipeId);

            res.status(200).json(favorite);
        }),

        deleteFavorite: asyncHandler(async (req, res) => {
            const recipeId = parseRecipeIdParam(req.params.recipeId);
            const isDeleted = await favoriteService.deleteFavorite(req.auth!.userId, recipeId);

            res.status(200).json({ ok: isDeleted });
        }),

        getFavoriteRecipes: asyncHandler(async (req, res) => {
            const pagination = parsePaginationQuery(req.query, 12, 'FAVORITES_PAGINATION');
            const favorites = await favoriteService.getFavoriteRecipes(req.auth!.userId, pagination);

            res.status(200).json(favorites);
        })
    };
}
