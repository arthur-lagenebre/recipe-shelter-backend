import { forbidden, notFound } from '../../utils/errors.js';
import { canArchiveRecipe } from '../recipes/recipe-permissions.js';

import type { AdminRecipeRepository } from "../../repositories/admin/admin.recipe.repository.interface.js";
import type { RecipeAdmin, RecipePending } from "../../repositories/admin/admin.recipe.types.js";
import type { RecipeImage } from '../../repositories/recipe-images/recipe-image.types.js';
import type { RecipeRepository } from '../../repositories/recipes/recipe.repository.interface.js';
import type { Recipe } from '../../repositories/recipes/recipe.types.js';

type RecipeImageCleanup = {
    findForCleanup(recipeId: number): Promise<RecipeImage | null>;
    cleanupAfterRecipeDeletion(image: RecipeImage): Promise<void>;
};

export class AdminRecipeService {
    constructor(private readonly recipeRepository: RecipeRepository, private readonly adminRecipeRepository: AdminRecipeRepository, private readonly recipeImageCleanup?: RecipeImageCleanup) { }

    async getPendingRecipesForAdmin(): Promise<RecipePending[]> {
        return this.adminRecipeRepository.findPendingForAdmin();
    }

    async getCountPendingRecipesForAdmin(): Promise<number> {
        return this.adminRecipeRepository.countPendingForAdmin();
    }

    async getRecipeForAdmin(recipeId: number): Promise<RecipeAdmin> {
        const recipe = await this.adminRecipeRepository.findByIdForAdmin(recipeId);

        if (!recipe)
            throw notFound('Recipe not found', 'RECIPES_NOT_FOUND');

        return recipe;
    }

    async approve(recipeId: number, adminUserId: number): Promise<boolean> {
        await this.requireModeratableRecipe(recipeId);

        return await this.adminRecipeRepository.publish(recipeId, adminUserId);
    }

    async reject(recipeId: number, adminUserId: number, rejectionReason: string): Promise<boolean> {
        await this.requireModeratableRecipe(recipeId);

        return await this.adminRecipeRepository.reject(recipeId, adminUserId, rejectionReason);
    }

    async archive(recipeId: number): Promise<boolean> {
        const recipe = await this.recipeRepository.findById(recipeId);

        if (!recipe)
            throw notFound('Recipe not found', 'RECIPES_NOT_FOUND');

        if (!canArchiveRecipe(recipe))
            throw forbidden('Recipe cannot be archived', 'RECIPES_ARCHIVE_FORBIDDEN');

        return this.recipeRepository.archive(recipeId);
    }

    async delete(recipeId: number): Promise<boolean> {
        const recipe = await this.recipeRepository.findById(recipeId);

        if (!recipe)
            throw notFound('Recipe not found', 'RECIPES_NOT_FOUND');

        const image = await this.recipeImageCleanup?.findForCleanup(recipeId) ?? null;
        const deleted = await this.adminRecipeRepository.delete(recipeId);

        if (deleted && image)
            await this.recipeImageCleanup?.cleanupAfterRecipeDeletion(image);

        return deleted;
    }

    private async requireModeratableRecipe(recipeId: number): Promise<Recipe> {
        const recipe = await this.recipeRepository.findById(recipeId);

        if (!recipe)
            throw notFound('Recipe not found', 'RECIPES_NOT_FOUND');

        if (recipe.status != 'pending')
            throw forbidden('Recipe cannot be moderated', 'RECIPES_MODERATE_FORBIDDEN');

        return recipe;
    }

}
