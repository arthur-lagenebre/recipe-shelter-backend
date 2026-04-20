import { badRequest } from '../../utils/errors.js';

export function parseIngredientIdParam(value: unknown): number {
    const ingredientId = typeof value === 'string' ? Number(value) : NaN;

    if (!Number.isInteger(ingredientId) || ingredientId <= 0)
        throw badRequest('Ingredient id must be a positive integer', 'INGREDIENT_BAD_ID');

    return ingredientId;
}