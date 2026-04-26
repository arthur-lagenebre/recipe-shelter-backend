import { parseRejectRecipeBody } from './admin-recipes.dto.js';
import { asyncHandler } from '../http/async-handler.js';
import { parseRecipeIdParam } from '../recipes/recipes.dto.js';

import type { RecipeService } from '../../services/recipes/recipes.services.js';

export function createAdminRecipesController(recipeService: RecipeService) {
    return {
        listPendingRecipes: asyncHandler(async (req, res) => {
            const recipes = await recipeService.getPendingForAdmin();
            res.status(200).json({ data: recipes });
        }),

        approveRecipe: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }

            const recipeId = parseRecipeIdParam(req.params.id);
            const moderatedByUserId = req.auth.userId;
            const result = await recipeService.approve(recipeId, moderatedByUserId);

            res.status(200).json({ result: result });
        }),

        rejectRecipe: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }

            const recipeId = parseRecipeIdParam(req.params.id);
            const moderatedByUserId = req.auth.userId;
            const rejectionReason = parseRejectRecipeBody(req.body);
            const result = await recipeService.reject(recipeId, moderatedByUserId, rejectionReason);

            res.status(200).json({ result: result });
        })
    };
}
