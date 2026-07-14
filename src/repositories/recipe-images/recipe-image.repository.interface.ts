import type { RecipeImage, SaveRecipeImageInput } from './recipe-image.types.js';

export interface RecipeImageRepository {
    findByRecipeId(recipeId: number): Promise<RecipeImage | null>;
    replace(input: SaveRecipeImageInput): Promise<RecipeImage | null>;
    deleteByRecipeId(recipeId: number): Promise<RecipeImage | null>;
}
