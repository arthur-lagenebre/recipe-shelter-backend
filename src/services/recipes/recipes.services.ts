import { forbidden, notFound } from '../../utils/errors.js';

import type { RecipeSlugService } from "./recipe-slug.service.js";
import type { AuthContext } from "../../api/auth/auth.types.js";
import type { RecipeRepository } from "../../repositories/recipes/recipe.repository.interface.js";
import type { Recipe, RecipeIngredientInput, RecipeInput, RecipeStepInput, RecipeUtensilInput, UpdateRecipeInput } from "../../repositories/recipes/recipe.types.js";

type AuthUser = AuthContext;

type RecipeContentInput = {
    categoryId?: number | null;
    title: string;
    description?: string;
    prepTimeMinutes?: number;
    restTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    servings?: number;
    ingredients?: RecipeIngredientInput[];
    steps?: RecipeStepInput[];
    utensils?: RecipeUtensilInput[];
};

export class RecipeService {
    constructor(private readonly recipeRepository: RecipeRepository, private readonly recipeSlugService: RecipeSlugService) { }

    async getMine(userId: number): Promise<Recipe[]> {
        return this.recipeRepository.findByUserId(userId);
    }

    async create(userId: number, input: RecipeContentInput): Promise<Recipe> {
        const recipe = await this.recipeRepository.create(await normalizeCreateRecipeInput(userId, input, this.recipeSlugService));

        return recipe;
    }

    async get(recipeId: number, auth: AuthUser): Promise<Recipe> {
        const recipe = await this.requireViewableRecipe(recipeId, auth);

        return recipe;
    }

    async updateDraft(recipeId: number, auth: AuthUser, input: RecipeContentInput): Promise<Recipe> {
        const recipe = await this.requireEditableRecipe(recipeId, auth);

        return this.recipeRepository.updateDraft(normalizeUpdateRecipeInput(recipe, input));
    }

    async submit(recipeId: number, auth: AuthUser): Promise<Recipe> {
        const recipe = await this.requireEditableRecipe(recipeId, auth);

        const publicSlug = await this.recipeSlugService.createPublicSlug(recipe.title);

        return this.recipeRepository.submit(recipeId, publicSlug);
    }

    async getPendingForAdmin(): Promise<Recipe[]> {
        return this.recipeRepository.findPendingForAdmin();
    }

    async approve(recipeId: number, auth: AuthUser) {
        await this.requireModeratableRecipe(recipeId, auth);

        await this.recipeRepository.publish(recipeId, auth.userId);
    }

    async reject(recipeId: number, auth: AuthUser, rejectionReason: string) {
        await this.requireModeratableRecipe(recipeId, auth);

        await this.recipeRepository.reject(recipeId, auth.userId, rejectionReason);
    }

    private async requireViewableRecipe(recipeId: number, auth: AuthUser): Promise<Recipe> {
        const recipe = await this.recipeRepository.findById(recipeId);

        if (!recipe)
            throw notFound('Recipe not found', 'RECIPES_NOT_FOUND');

        if (!this.canViewRecipe(recipe, auth))
            throw forbidden('Recipe access denied', 'RECIPES_ACCESS_DENIED');

        return recipe;
    }

    private async requireEditableRecipe(recipeId: number, auth: AuthUser): Promise<Recipe> {
        const recipe = await this.recipeRepository.findById(recipeId);

        if (!recipe)
            throw notFound('Recipe not found', 'RECIPES_NOT_FOUND');

        if (!this.canEditRecipe(recipe, auth))
            throw forbidden('Recipe cannot be edited', 'RECIPES_EDIT_FORBIDDEN');

        return recipe;
    }

    private async requireModeratableRecipe(recipeId: number, auth: AuthUser): Promise<Recipe> {
        const recipe = await this.recipeRepository.findById(recipeId);

        if (!recipe)
            throw notFound('Recipe not found', 'RECIPES_NOT_FOUND');

        if (!this.canModerateRecipe(recipe, auth))
            throw forbidden('Recipe cannot be moderated', 'RECIPES_MODERATE_FORBIDDEN');

        return recipe;
    }

    private isAdmin(auth: AuthUser): boolean {
        return auth.roleId === 1;
    }

    private isOwner(recipe: Recipe, auth: AuthUser): boolean {
        return recipe.userId === auth.userId;
    }

    private canViewRecipe(recipe: Recipe, auth: AuthUser): boolean {
        return this.isAdmin(auth) || this.isOwner(recipe, auth) || recipe.status === 'published';
    }

    private canEditRecipe(recipe: Recipe, auth: AuthUser): boolean {
        return this.isOwner(recipe, auth) && (recipe.status === 'draft' || recipe.status === 'rejected');
    }

    private canModerateRecipe(recipe: Recipe, auth: AuthUser): boolean {
        return this.isAdmin(auth) && recipe.status === 'pending';
    }
}

function normalizeNullableUnit(unit: string | null | undefined): string | null {
    const normalizedUnit = unit?.trim();

    return normalizedUnit ? normalizedUnit : null;
}

async function normalizeCreateRecipeInput(userId: number, input: RecipeContentInput, recipeSlugService: RecipeSlugService): Promise<RecipeInput> {
    const normalizedTitle = input.title.trim();
    const normalizedSlug = await recipeSlugService.createDraftSlug(userId);

    return {
        userId,
        categoryId: input.categoryId ?? null,
        title: normalizedTitle,
        slug: normalizedSlug,
        description: input.description?.trim() ?? '',
        prepTimeMinutes: input.prepTimeMinutes ?? 0,
        restTimeMinutes: input.restTimeMinutes ?? null,
        cookTimeMinutes: input.cookTimeMinutes ?? null,
        servings: input.servings ?? 1,
        ingredients: input.ingredients?.map((ingredient, index) => ({
            ingredientId: ingredient.ingredientId,
            quantity: ingredient.quantity,
            unit: normalizeNullableUnit(ingredient.unit),
            note: ingredient.note?.trim() ?? null,
            sortOrder: ingredient.sortOrder ?? index + 1
        })) ?? [],
        steps: input.steps?.map((step, index) => ({
            stepNumber: step.stepNumber ?? index + 1,
            description: step.description.trim()
        })) ?? [],
        utensils: input.utensils?.map((utensil) => ({
            utensilId: utensil.utensilId
        })) ?? []
    };
}

function normalizeUpdateRecipeInput(recipe: Recipe, input: RecipeContentInput): UpdateRecipeInput {
    return {
        id: recipe.id,
        userId: recipe.userId,
        slug: recipe.slug,
        categoryId: input.categoryId,
        title: input.title.trim(),
        description: input.description?.trim(),
        prepTimeMinutes: input.prepTimeMinutes,
        restTimeMinutes: input.restTimeMinutes,
        cookTimeMinutes: input.cookTimeMinutes,
        servings: input.servings,
        ingredients: input.ingredients?.map((ingredient, index) => ({
            ingredientId: ingredient.ingredientId,
            quantity: ingredient.quantity,
            unit: normalizeNullableUnit(ingredient.unit),
            note: ingredient.note?.trim() ?? null,
            sortOrder: ingredient.sortOrder ?? index + 1
        })),
        steps: input.steps?.map((step, index) => ({
            stepNumber: step.stepNumber ?? index + 1,
            description: step.description.trim()
        })),
        utensils: input.utensils?.map((utensil) => ({
            utensilId: utensil.utensilId
        }))
    };
}
