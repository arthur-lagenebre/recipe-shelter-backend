import { forbidden, internalError, notFound } from '../../utils/errors.js';

import type { FavoriteRepository } from '../../repositories/favorites/favorites.repository.interface.js';
import type { Favorite } from '../../repositories/favorites/favorites.types.js';
import type { RecipeRepository } from '../../repositories/recipes/recipe.repository.interface.js';
import type { RecipeListItem } from '../../repositories/recipes/recipe.types.js';
import type { PaginatedResult, PaginationOptions } from '../../utils/pagination.js';

export class FavoriteService {
    constructor(private readonly favoriteRepository: FavoriteRepository, private readonly recipeRepository: RecipeRepository) { }

    async createFavorite(userId: number, recipeId: number): Promise<Favorite> {
        const recipe = await this.recipeRepository.findById(recipeId);

        if (!recipe)
            throw notFound('Recipe not found', 'RECIPES_NOT_FOUND');

        if (recipe.status !== 'published' && recipe.userId !== userId)
            throw forbidden('Recipe access denied', 'RECIPES_ACCESS_DENIED');

        const favorite = await this.favoriteRepository.create(userId, recipeId);

        if (!favorite)
            throw internalError('Favorite cannot be created', 'FAVORITE_CANNOT_BE_CREATED');

        return favorite;
    }

    async deleteFavorite(userId: number, recipeId: number): Promise<boolean> {
        const isDeleted = await this.favoriteRepository.delete(userId, recipeId);

        if (!isDeleted)
            throw internalError('Favorite cannot be deleted', 'FAVORITE_CANNOT_BE_DELETED');

        return isDeleted;
    }

    async getFavoriteRecipes(userId: number, pagination: PaginationOptions): Promise<PaginatedResult<RecipeListItem>> {
        return this.favoriteRepository.getFavoriteRecipes(userId, pagination);
    }
}
