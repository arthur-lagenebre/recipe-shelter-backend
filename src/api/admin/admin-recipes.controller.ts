import { parseRejectRecipeBody } from './admin-recipes.dto.js';
import { asyncHandler } from '../http/async-handler.js';
import { parseRecipeIdParam } from '../recipes/recipes.dto.js';

import type { RecipeService } from '../../services/recipes/recipes.services.js';

export function createAdminRecipesController(recipeService: RecipeService) {
    return {
        listPendingRecipes: asyncHandler(async (req, res) => {
            const recipes = await recipeService.getPendingForAdmin();
            res.status(200).json(recipes);
        }),

        approveRecipe: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }

            const recipeId = parseRecipeIdParam(req.params.id);
            
            await recipeService.approve(recipeId, req.auth);

            res.sendStatus(200);
        }),

        rejectRecipe: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }

            const recipeId = parseRecipeIdParam(req.params.id);
            const rejectionReason = parseRejectRecipeBody(req.body);

            await recipeService.reject(recipeId, req.auth, rejectionReason);

            res.sendStatus(200);
        })
    };
}
