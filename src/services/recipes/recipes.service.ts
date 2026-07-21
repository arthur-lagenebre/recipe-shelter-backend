import { canArchiveRecipe, canEditRecipe, canViewRecipe, isRecipeOwner } from './recipe-permissions.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { normalizeIngredientName } from '../ingredients/ingredients.service.js';

import type { RecipeSlugService } from './recipe-slug.service.js';
import type { AuthContext } from '../../api/auth/auth.types.js';
import type { RecipeRepository } from '../../repositories/recipes/recipe.repository.interface.js';
import type {
    Recipe,
    RecipeDetail,
    RecipeIngredientInput,
    RecipeInput,
    RecipeListItem,
    RecipeStepInput,
    RecipeSummary,
    RecipeEquipmentInput,
    RecipeSearchFilters,
    UpdateRecipeInput
} from '../../repositories/recipes/recipe.types.js';
import type { PaginatedResult, PaginationOptions } from '../../utils/pagination.js';

type RecipeContentInput = {
    categoryId?: number | null;
    title: string;
    description?: string;
    prepTimeMinutes?: number;
    restTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    servings?: number;
    tagIds?: number[];
    ingredients?: RecipeIngredientInput[];
    steps?: RecipeStepInput[];
    equipments?: RecipeEquipmentInput[];
};

const INGREDIENT_NAME_MAX_LENGTH = 255;

export class RecipeService {
    constructor(
        private readonly recipeRepository: RecipeRepository,
        private readonly recipeSlugService: RecipeSlugService
    ) {}

    async getMine(userId: number, pagination: PaginationOptions): Promise<PaginatedResult<RecipeSummary>> {
        return this.recipeRepository.findByUserId(userId, pagination);
    }

    async create(userId: number, input: RecipeContentInput): Promise<Recipe> {
        const recipe = await this.recipeRepository.create(await normalizeCreateRecipeInput(userId, input, this.recipeSlugService));

        return recipe;
    }

    async get(recipeId: number, auth: AuthContext): Promise<Recipe> {
        const recipe = await this.requireViewableRecipe(recipeId, auth);

        return recipe;
    }

    async updateDraft(recipeId: number, auth: AuthContext, input: RecipeContentInput): Promise<Recipe> {
        const recipe = await this.requireEditableRecipe(recipeId, auth);

        return this.recipeRepository.updateDraft(normalizeUpdateRecipeInput(recipe, input));
    }

    async submit(recipeId: number, auth: AuthContext): Promise<Recipe> {
        const recipe = await this.requireEditableRecipe(recipeId, auth);

        const publicSlug = await this.recipeSlugService.createPublicSlug(recipe.title);

        return this.recipeRepository.submit(recipeId, publicSlug);
    }

    async archive(recipeId: number, auth: AuthContext): Promise<boolean> {
        const recipe = await this.recipeRepository.findById(recipeId);

        if (!recipe)
            throw notFound('Recipe not found', 'RECIPES_NOT_FOUND');

        if (!isRecipeOwner(recipe, auth))
            throw forbidden('Recipe access denied', 'RECIPES_ACCESS_DENIED');

        if (!canArchiveRecipe(recipe))
            throw forbidden('Recipe cannot be archived', 'RECIPES_ARCHIVE_FORBIDDEN');

        return this.recipeRepository.archive(recipeId);
    }

    async getPublished(
        userId: number | null,
        filters: RecipeSearchFilters,
        pagination: PaginationOptions
    ): Promise<PaginatedResult<RecipeListItem>> {
        return await this.recipeRepository.searchPublished(userId, filters, pagination);
    }

    async searchPublished(
        userId: number | null,
        filters: RecipeSearchFilters,
        pagination: PaginationOptions
    ): Promise<PaginatedResult<RecipeListItem>> {
        return await this.recipeRepository.searchPublished(userId, filters, pagination);
    }

    async getRecentPublished(userId: number | null, limit: number): Promise<RecipeListItem[]> {
        return await this.recipeRepository.findRecentPublished(userId, limit);
    }

    async getBySlug(userId: number | null, slug: string): Promise<RecipeDetail | null> {
        return await this.recipeRepository.findPublishedBySlug(userId, slug);
    }

    private async requireViewableRecipe(recipeId: number, auth: AuthContext): Promise<Recipe> {
        const recipe = await this.recipeRepository.findById(recipeId);

        if (!recipe)
            throw notFound('Recipe not found', 'RECIPES_NOT_FOUND');

        if (!canViewRecipe(recipe, auth))
            throw forbidden('Recipe access denied', 'RECIPES_ACCESS_DENIED');

        return recipe;
    }

    private async requireEditableRecipe(recipeId: number, auth: AuthContext): Promise<Recipe> {
        const recipe = await this.recipeRepository.findById(recipeId);

        if (!recipe)
            throw notFound('Recipe not found', 'RECIPES_NOT_FOUND');

        if (!canEditRecipe(recipe, auth))
            throw forbidden('Recipe cannot be edited', 'RECIPES_EDIT_FORBIDDEN');

        return recipe;
    }
}

function normalizeNullableUnit(unit: string | null | undefined): string | null {
    const normalizedUnit = unit?.trim();

    return normalizedUnit ? normalizedUnit : null;
}

function normalizeTagIds(tagIds: number[] | undefined): number[] {
    return [...new Set(tagIds ?? [])];
}

async function normalizeCreateRecipeInput(
    userId: number,
    input: RecipeContentInput,
    recipeSlugService: RecipeSlugService
): Promise<RecipeInput> {
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
        tagIds: normalizeTagIds(input.tagIds),
        ingredients:
            input.ingredients?.map((ingredient, index) => ({
                ingredientId: ingredient.ingredientId ?? null,
                displayText: ingredient.displayText.trim(),
                normalizedName: normalizeRecipeIngredientName(ingredient),
                quantity: ingredient.quantity ?? null,
                unit: normalizeNullableUnit(ingredient.unit),
                note: ingredient.note?.trim() ?? null,
                sortOrder: ingredient.sortOrder ?? index + 1
            })) ?? [],
        steps:
            input.steps?.map((step, index) => ({
                stepNumber: step.stepNumber ?? index + 1,
                description: step.description.trim()
            })) ?? [],
        equipments:
            input.equipments?.map((equipment) => ({
                equipmentId: equipment.equipmentId
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
        tagIds: input.tagIds === undefined ? undefined : normalizeTagIds(input.tagIds),
        ingredients: input.ingredients?.map((ingredient, index) => ({
            ingredientId: ingredient.ingredientId ?? null,
            displayText: ingredient.displayText.trim(),
            normalizedName: normalizeRecipeIngredientName(ingredient),
            quantity: ingredient.quantity ?? null,
            unit: normalizeNullableUnit(ingredient.unit),
            note: ingredient.note?.trim() ?? null,
            sortOrder: ingredient.sortOrder ?? index + 1
        })),
        steps: input.steps?.map((step, index) => ({
            stepNumber: step.stepNumber ?? index + 1,
            description: step.description.trim()
        })),
        equipments: input.equipments?.map((equipment) => ({
            equipmentId: equipment.equipmentId
        }))
    };
}

function normalizeRecipeIngredientName(ingredient: RecipeIngredientInput): string {
    const normalizedName = normalizeIngredientName(ingredient.displayText);

    if (ingredient.ingredientId === undefined || ingredient.ingredientId === null) {
        if (!normalizedName)
            throw badRequest('Unknown ingredient displayText must contain letters or numbers', 'RECIPES_BAD_INGREDIENT_NAME');
        if (normalizedName.length > INGREDIENT_NAME_MAX_LENGTH)
            throw badRequest(
                `Normalized ingredient name must be at most ${INGREDIENT_NAME_MAX_LENGTH} characters`,
                'RECIPES_BAD_INGREDIENT_NAME'
            );
    }

    return normalizedName;
}
