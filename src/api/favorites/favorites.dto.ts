import { badRequest } from '../../utils/errors.js';

export function parseRecipeIdParam(value: unknown): number {
    const recipeId = typeof value === 'string' ? Number(value) : NaN;

    if (!Number.isInteger(recipeId) || recipeId <= 0) throw badRequest('Recipe id must be a positive integer', 'RECIPE_BAD_ID');

    return recipeId;
}
