import type { AuthContext } from '../../api/auth/auth.types.js';
import type { Recipe } from '../../repositories/recipes/recipe.types.js';

export function isRecipeOwner(recipe: Recipe, auth: AuthContext): boolean {
    return recipe.userId === auth.userId;
}

export function canViewRecipe(recipe: Recipe, auth: AuthContext): boolean {
    return auth.roleId === 1 || isRecipeOwner(recipe, auth) || recipe.status === 'published';
}

export function canEditRecipe(recipe: Recipe, auth: AuthContext): boolean {
    return isRecipeOwner(recipe, auth) && (recipe.status === 'draft' || recipe.status === 'rejected');
}

export function canArchiveRecipe(recipe: Recipe): boolean {
    return recipe.status === 'published' || recipe.status === 'rejected';
}
