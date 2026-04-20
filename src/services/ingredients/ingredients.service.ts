import { type Ingredient } from '../../repositories/ingredients/ingredient.types.js';
import { notFound } from '../../utils/errors.js';

import type { IngredientRepository } from '../../repositories/ingredients/ingredient-repository.interface.js';

export class IngredientService {
    constructor(private readonly ingredientRepository: IngredientRepository) { }

    async getIngredients(): Promise<Ingredient[]> {
        const ingredients = await this.ingredientRepository.findAll();

        if (!ingredients)
            throw notFound('Ingredients not found', 'INGREDIENTS_NOT_FOUND');

        return ingredients;
    }

    async getIngredient(ingredientId: number): Promise<Ingredient> {
        const ingredient = await this.ingredientRepository.findById(ingredientId);

        if (!ingredient)
            throw notFound('Ingredient not found', 'INGREDIENT_NOT_FOUND');

        return ingredient;
    }
}