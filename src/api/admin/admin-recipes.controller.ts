import { parseRejectRecipeBody } from './admin-recipes.dto.js';
import { type AdminRecipeService } from '../../services/admin/admin.recipes.services.js';
import { asyncHandler } from '../http/async-handler.js';
import { parseRecipeIdParam } from '../recipes/recipes.dto.js';

export function createAdminRecipesController(adminRecipeService: AdminRecipeService) {
    return {
        listPendingRecipes: asyncHandler(async (req, res) => {
            const recipes = await adminRecipeService.getPendingRecipesForAdmin();
            res.status(200).json(recipes);
        }),

        getRecipeAdmin: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }

            const recipeId = parseRecipeIdParam(req.params.id);
            const result = await adminRecipeService.getRecipeForAdmin(recipeId);

            res.status(200).json(result);
        }),

        approveRecipe: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }

            const recipeId = parseRecipeIdParam(req.params.id);
            
            await adminRecipeService.approve(recipeId, req.auth);

            res.sendStatus(200);
        }),

        rejectRecipe: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }

            const recipeId = parseRecipeIdParam(req.params.id);
            const rejectionReason = parseRejectRecipeBody(req.body);

            await adminRecipeService.reject(recipeId, req.auth, rejectionReason);

            res.sendStatus(200);
        })
    };
}
