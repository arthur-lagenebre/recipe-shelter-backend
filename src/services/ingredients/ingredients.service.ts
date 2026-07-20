import { notFound } from '../../utils/errors.js';

import type { IngredientRepository } from '../../repositories/ingredients/ingredient.repository.interface.js';
import type { Ingredient } from '../../repositories/ingredients/ingredient.types.js';

const ingredientNameTransliterations: ReadonlyArray<readonly [RegExp, string]> = [
    [/æ/g, 'ae'],
    [/œ/g, 'oe'],
    [/ß/g, 'ss'],
    [/ø/g, 'o'],
    [/[ðđ]/g, 'd'],
    [/ł/g, 'l']
];

export function normalizeIngredientName(name: string): string {
    let normalizedName = name
        .normalize('NFKD')
        .toLowerCase()
        .replace(/\p{M}+/gu, '');

    for (const [characters, replacement] of ingredientNameTransliterations)
        normalizedName = normalizedName.replace(characters, replacement);

    return normalizedName
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

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
