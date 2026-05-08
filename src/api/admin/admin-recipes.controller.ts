import { parseRejectRecipeBody } from './admin-recipes.dto.js';
import { asyncHandler } from '../http/async-handler.js';
import { parseRecipeIdParam } from '../recipes/recipes.dto.js';

import type { AdminRecipeService } from '../../services/admin/admin.recipes.services.js';

export function createAdminRecipesController(adminRecipeService: AdminRecipeService) {
    return {
        listPendingRecipes: asyncHandler(async (req, res) => {
            const recipes = await adminRecipeService.getPendingRecipesForAdmin();
            res.status(200).json(recipes);
        }),

        countPendingRecipes: asyncHandler(async (req, res) => {
            const count = await adminRecipeService.getCountPendingRecipesForAdmin();
            res.status(200).json({ pendingRecipes: count });
        }),

        getRecipeAdmin: asyncHandler(async (req, res) => {
            const recipeId = parseRecipeIdParam(req.params.id);
            const result = await adminRecipeService.getRecipeForAdmin(recipeId);

            res.status(200).json(result);
        }),

        approveRecipe: asyncHandler(async (req, res) => {
            const recipeId = parseRecipeIdParam(req.params.id);
            
            const result = await adminRecipeService.approve(recipeId, req.auth!.userId);

            res.status(200).json({ ok: result });
        }),

        rejectRecipe: asyncHandler(async (req, res) => {
            const recipeId = parseRecipeIdParam(req.params.id);
            const rejectionReason = parseRejectRecipeBody(req.body);

             const result = await adminRecipeService.reject(recipeId, req.auth!.userId, rejectionReason);

            res.status(200).json({ ok: result });
        }),

        archiveRecipe: asyncHandler(async (req, res) => {
            const recipeId = parseRecipeIdParam(req.params.id);

            const result = await adminRecipeService.archive(recipeId);

            res.status(200).json({ ok: result });
        }),

        deleteRecipe: asyncHandler(async (req, res) => {
            const recipeId = parseRecipeIdParam(req.params.id);
            const result = await adminRecipeService.delete(recipeId);

            res.status(200).json({ ok: result });
        })
    };
}
