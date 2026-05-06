import { parseCreateFavoriteBody, parseDeleteFavoriteBody } from './favorites.dto.js';
import { asyncHandler } from '../http/async-handler.js';

import type { FavoriteService } from '../../services/favorites/favorites.service.js';

export function createFavoritesController(favoriteService: FavoriteService) {
    return {
        createFavorite: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }

            const body = parseCreateFavoriteBody(req.body);
            const favorite = await favoriteService.createFavorite(body.userId, body.recipeId);

            res.status(200).json(favorite);
        }),

        deleteFavorite: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }

            const body = parseDeleteFavoriteBody(req.body);
            const isDeleted = await favoriteService.deleteFavorite(body.userId, body.recipeId);

            res.status(200).json(isDeleted);
        })
    };
}
