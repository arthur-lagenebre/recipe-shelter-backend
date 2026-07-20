import { parseIngredientIdParam } from './ingredients.dto.js';
import { asyncHandler } from '../http/async-handler.js';

import type { IngredientService } from '../../services/ingredients/ingredients.service.js';

export function createIngredientsController(ingredientService: IngredientService) {
    return {
        getIngredients: asyncHandler(async (req, res) => {
            const ingredients = await ingredientService.getIngredients();
            res.status(200).json(ingredients);
        }),

        getIngredient: asyncHandler(async (req, res) => {
            const ingredientId = parseIngredientIdParam(req.params.id);
            const profile = await ingredientService.getIngredient(ingredientId);
            res.status(200).json(profile);
        })
    };
}
