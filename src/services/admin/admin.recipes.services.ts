import { forbidden, notFound } from '../../utils/errors.js';

import type { AuthContext } from '../../api/auth/auth.types.js';
import type { AdminRecipeRepository } from "../../repositories/admin/admin.recipe.repository.interface.js";
import type { RecipeAdmin, RecipePending } from "../../repositories/admin/admin.recipe.types.js";
import type { RecipeRepository } from '../../repositories/recipes/recipe.repository.interface.js';
import type { Recipe } from '../../repositories/recipes/recipe.types.js';

export class AdminRecipeService {
    constructor(private readonly recipeRepository: RecipeRepository, private readonly adminRecipeRepository: AdminRecipeRepository) { }

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

    async approve(recipeId: number, auth: AuthContext) {
        await this.requireModeratableRecipe(recipeId, auth);

        await this.adminRecipeRepository.publish(recipeId, auth.userId);
    }

    async reject(recipeId: number, auth: AuthContext, rejectionReason: string) {
        await this.requireModeratableRecipe(recipeId, auth);

        await this.adminRecipeRepository.reject(recipeId, auth.userId, rejectionReason);
    }

    private async requireModeratableRecipe(recipeId: number, auth: AuthContext): Promise<Recipe> {
        const recipe = await this.recipeRepository.findById(recipeId);

        if (!recipe)
            throw notFound('Recipe not found', 'RECIPES_NOT_FOUND');

        if (!this.canModerateRecipe(recipe, auth))
            throw forbidden('Recipe cannot be moderated', 'RECIPES_MODERATE_FORBIDDEN');

        return recipe;
    }

    private isAdmin(auth: AuthContext): boolean {
        return auth.roleId === 1;
    }

    private canModerateRecipe(recipe: Recipe, auth: AuthContext): boolean {
        return this.isAdmin(auth) && recipe.status === 'pending';
    }
}
