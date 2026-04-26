import { badRequest, notFound } from '../../utils/errors.js';

import type { RecipeSlugService } from "./recipe-slug.service.js";
import type { RecipeRepository } from "../../repositories/recipes/recipe.repository.interface.js";
import type { Recipe, RecipeIngredientInput, RecipeInput, RecipeStepInput, RecipeUtensilInput, UpdateRecipeInput } from "../../repositories/recipes/recipe.types.js";

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

    async get(recipeId: number, userId: number): Promise<Recipe> {
        const recipe = await this.requireOwnedRecipe(recipeId, userId);

        return recipe;
    }

    async updateDraft(recipeId: number, userId: number, input: RecipeContentInput): Promise<Recipe> {
        const recipe = await this.requireOwnedRecipe(recipeId, userId);

        if (recipe.status !== 'draft' && recipe.status !== 'rejected')
            throw badRequest('Only draft or rejected recipes can be updated', 'RECIPES_UPDATE_INVALID_STATUS');

        return this.recipeRepository.updateDraft(normalizeUpdateRecipeInput(recipe, input));
    }

    async submit(recipeId: number, userId: number): Promise<Recipe> {
        const recipe = await this.requireOwnedRecipe(recipeId, userId);

        if (recipe.status !== 'draft' && recipe.status !== 'rejected')
            throw badRequest('Only draft or rejected recipes can be submitted', 'RECIPES_SUBMIT_INVALID_STATUS');

        const publicSlug = await this.recipeSlugService.createPublicSlug(recipe.title);

        return this.recipeRepository.submit(recipeId, publicSlug);
    }

    async getPendingForAdmin(): Promise<Recipe[]> {
        return this.recipeRepository.findPendingForAdmin();
    }

    async approve(recipeId: number, moderatedByUserId: number) {
        const recipe = await this.recipeRepository.findById(recipeId);

        if (!recipe)
            throw notFound('Recipe not found', 'RECIPE_NOT_FOUND');

        if (recipe.status !== 'pending')
            throw badRequest('Only pending recipe can be published', 'RECIPE_APPROVE_INVALID_STATUS');

        await this.recipeRepository.publish(recipeId, moderatedByUserId);
    }

    async reject(recipeId: number, moderatedByUserId: number, rejectionReason: string) {
        const recipe = await this.recipeRepository.findById(recipeId);

        if (!recipe)
            throw notFound('Recipe not found', 'RECIPE_NOT_FOUND');

        if (recipe.status !== 'pending')
            throw badRequest('Only pending recipe can be rejected', 'RECIPE_REJECT_INVALID_STATUS');

        await this.recipeRepository.reject(recipeId, moderatedByUserId, rejectionReason);
    }

    private async requireOwnedRecipe(recipeId: number, userId: number): Promise<Recipe> {
        const recipe = await this.recipeRepository.findByIdForUser(recipeId, userId);

        if (!recipe)
            throw notFound('Recipe not found', 'RECIPES_NOT_FOUND');

        return recipe;
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
