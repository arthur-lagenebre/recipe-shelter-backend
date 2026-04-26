import { parseCreateRecipeBody, parseRecipeIdParam, parseUpdateRecipeBody } from './recipes.dto.js';
import { asyncHandler } from '../http/async-handler.js';

import type { RecipeService } from '../../services/recipes/recipes.services.js';

export function createRecipesController(recipeService: RecipeService) {
    return {
        getMyRecipes: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }

            const result = await recipeService.getMine(req.auth.userId);

            res.status(200).json(result);
        }),

        createRecipe: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }

            const body = parseCreateRecipeBody(req.body);
            const result = await recipeService.create(req.auth.userId, body);

            res.status(201).json(result);
        }),

        getRecipe: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }

            const recipeId = parseRecipeIdParam(req.params.id);
            const result = await recipeService.get(recipeId, req.auth);

            res.status(200).json(result);
        }),

        updateRecipe: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }

            const recipeId = parseRecipeIdParam(req.params.id);
            const body = parseUpdateRecipeBody(req.body);
            const result = await recipeService.updateDraft(recipeId, req.auth, body);

            res.status(200).json(result);
        }),

        submitRecipe: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }

            const recipeId = parseRecipeIdParam(req.params.id);
            const result = await recipeService.submit(recipeId, req.auth);

            res.status(200).json(result);
        }),
    };
}
