import { parseCreateRecipeBody, parseRecipeFeedLimitQuery, parseRecipeSlugParam, parseRecipeIdParam, parseRecipeSearchQuery, parseUpdateRecipeBody } from './recipes.dto.js';
import { unauthorized } from '../../utils/errors.js';
import { parsePaginationQuery } from '../../utils/pagination.js';
import { asyncHandler } from '../http/async-handler.js';

import type { RecipeImageService } from '../../services/recipes/recipe-image.service.js';
import type { RecipeService } from '../../services/recipes/recipes.services.js';

export function createRecipesController(recipeService: RecipeService, recipeImageService: RecipeImageService) {
    return {
        getMyRecipes: asyncHandler(async (req, res) => {
            if (!req.auth) throw unauthorized('Unauthorized', 'AUTH_UNAUTHORIZED');

            const pagination = parsePaginationQuery(req.query, 10, 'RECIPES_PAGINATION');
            const result = await recipeService.getMine(req.auth.userId, pagination);

            res.status(200).json(result);
        }),

        createRecipe: asyncHandler(async (req, res) => {
            if (!req.auth) throw unauthorized('Unauthorized', 'AUTH_UNAUTHORIZED');

            const body = parseCreateRecipeBody(req.body);
            const result = await recipeService.create(req.auth.userId, body);

            res.status(201).json(result);
        }),

        getRecipes: asyncHandler(async (req, res) => {
            const filters = parseRecipeSearchQuery(req.query);
            const pagination = parsePaginationQuery(req.query, 12, 'RECIPES_PAGINATION');
            const result = await recipeService.getPublished(req.auth?.userId ?? null, filters, pagination);

            res.status(200).json(result);
        }),

        searchRecipes: asyncHandler(async (req, res) => {
            const filters = parseRecipeSearchQuery(req.query);
            const pagination = parsePaginationQuery(req.query, 12, 'RECIPES_PAGINATION');
            const result = await recipeService.searchPublished(req.auth?.userId ?? null, filters, pagination);

            res.status(200).json(result);
        }),

        getRecentRecipes: asyncHandler(async (req, res) => {
            const limit = parseRecipeFeedLimitQuery(req.query);
            const result = await recipeService.getRecentPublished(req.auth?.userId ?? null, limit);

            res.status(200).json(result);
        }),

        getRecipeBySlug: asyncHandler(async (req, res) => {
            const recipeSlug = parseRecipeSlugParam(req.params.slug);
            const result = await recipeService.getBySlug(req.auth?.userId ?? null, recipeSlug);

            if (!result) {
                res.status(404).json({ error: { message: 'Recipe not found', code: 'NOT_FOUND' } });

                return;
            }

            res.status(200).json(result);
        }),


        getRecipe: asyncHandler(async (req, res) => {
            if (!req.auth) throw unauthorized('Unauthorized', 'AUTH_UNAUTHORIZED');

            const recipeId = parseRecipeIdParam(req.params.id);
            const result = await recipeService.get(recipeId, req.auth);

            res.status(200).json(result);
        }),

        updateRecipe: asyncHandler(async (req, res) => {
            if (!req.auth) throw unauthorized('Unauthorized', 'AUTH_UNAUTHORIZED');

            const recipeId = parseRecipeIdParam(req.params.id);
            const body = parseUpdateRecipeBody(req.body);
            const result = await recipeService.updateDraft(recipeId, req.auth, body);

            res.status(200).json(result);
        }),

        submitRecipe: asyncHandler(async (req, res) => {
            if (!req.auth) throw unauthorized('Unauthorized', 'AUTH_UNAUTHORIZED');

            const recipeId = parseRecipeIdParam(req.params.id);
            const result = await recipeService.submit(recipeId, req.auth);

            res.status(200).json(result);
        }),

        archiveRecipe: asyncHandler(async (req, res) => {
            if (!req.auth) throw unauthorized('Unauthorized', 'AUTH_UNAUTHORIZED');

            const recipeId = parseRecipeIdParam(req.params.id);
            const result = await recipeService.archive(recipeId, req.auth);

            res.status(200).json({ ok: result });
        }),

        replaceCoverImage: asyncHandler(async (req, res) => {
            if (!req.auth) throw unauthorized('Unauthorized', 'AUTH_UNAUTHORIZED');

            const recipeId = parseRecipeIdParam(req.params.recipeId);
            const result = await recipeImageService.replace(
                recipeId,
                req.auth,
                req.file ? { buffer: req.file.buffer, size: req.file.size } : undefined,
                req.body?.altText
            );

            res.status(200).json(result);
        }),

        deleteCoverImage: asyncHandler(async (req, res) => {
            if (!req.auth) throw unauthorized('Unauthorized', 'AUTH_UNAUTHORIZED');

            const recipeId = parseRecipeIdParam(req.params.recipeId);
            await recipeImageService.delete(recipeId, req.auth);

            res.status(204).send();
        }),

    };
}
