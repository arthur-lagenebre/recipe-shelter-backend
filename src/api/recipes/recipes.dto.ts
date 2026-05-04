import { badRequest } from '../../utils/errors.js';

import type { RecipeIngredientInput, RecipeStepInput, RecipeUtensilInput } from '../../repositories/recipes/recipe.types.js';

export type RecipeBody = {
    categoryId?: number | null;
    title: string;
    description?: string;
    coverImageUrl?: string | null;
    prepTimeMinutes?: number;
    restTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    servings?: number;
    tagIds?: number[];
    ingredients?: RecipeIngredientInput[];
    steps?: RecipeStepInput[];
    utensils?: RecipeUtensilInput[];
};

export type CreateRecipeBody = RecipeBody;
export type UpdateRecipeBody = RecipeBody;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function getRequiredString(value: unknown, message: string, code: string): string {
    const result = typeof value === 'string' ? value.trim() : '';

    if (!result)
        throw badRequest(message, code);

    return result;
}

function getOptionalString(value: unknown, message: string, code: string): string | undefined {
    if (value === undefined || value === null)
        return undefined;

    if (typeof value !== 'string')
        throw badRequest(message, code);

    return value.trim();
}

function getOptionalNullableString(value: unknown, message: string, code: string): string | null | undefined {
    if (value === undefined)
        return undefined;

    if (value === null)
        return null;

    if (typeof value !== 'string')
        throw badRequest(message, code);

    return value.trim();
}

function getOptionalNumber(value: unknown, message: string, code: string): number | undefined {
    if (value === undefined || value === null)
        return undefined;

    if (typeof value !== 'number' || !Number.isFinite(value))
        throw badRequest(message, code);

    return value;
}

function getOptionalNullableNumber(value: unknown, message: string, code: string): number | null | undefined {
    if (value === undefined)
        return undefined;

    if (value === null)
        return null;

    if (typeof value !== 'number' || !Number.isFinite(value))
        throw badRequest(message, code);

    return value;
}

function getRequiredNumber(value: unknown, message: string, code: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw badRequest(message, code);

    return value;
}

function getRequiredPositiveInteger(value: unknown, message: string, code: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0)
        throw badRequest(message, code);

    return value;
}

function getOptionalArray<T>(value: unknown, parser: (item: unknown, index: number) => T, message: string, code: string): T[] | undefined {
    if (value === undefined || value === null)
        return undefined;

    if (!Array.isArray(value))
        throw badRequest(message, code);

    return value.map(parser);
}

function parseIngredient(item: unknown, index: number): RecipeIngredientInput {
    if (!isRecord(item))
        throw badRequest(`Ingredient #${index + 1} is invalid`, 'RECIPES_CREATE_BAD_INGREDIENT');

    const unit = getOptionalNullableString(item.unit, 'Ingredient unit must be a string or null', 'RECIPES_CREATE_BAD_INGREDIENT_UNIT');
    const note = getOptionalString(item.note, 'Ingredient note must be a string', 'RECIPES_CREATE_BAD_INGREDIENT_NOTE');
    const sortOrder = getOptionalNumber(item.sortOrder, 'Ingredient sortOrder must be a number', 'RECIPES_CREATE_BAD_INGREDIENT_SORT_ORDER');

    return {
        ingredientId: getRequiredNumber(item.ingredientId, 'IngredientId must be a number', 'RECIPES_CREATE_BAD_INGREDIENT_ID'),
        quantity: getRequiredNumber(item.quantity, 'Ingredient quantity must be a number', 'RECIPES_CREATE_BAD_INGREDIENT_QUANTITY'),
        unit,
        note,
        sortOrder
    };
}

function parseStep(item: unknown, index: number): RecipeStepInput {
    if (!isRecord(item))
        throw badRequest(`Step #${index + 1} is invalid`, 'RECIPES_CREATE_BAD_STEP');

    return {
        stepNumber: getOptionalNumber(item.stepNumber, 'StepNumber must be a number', 'RECIPES_CREATE_BAD_STEP_NUMBER'),
        description: getRequiredString(item.description, 'Step description is required', 'RECIPES_CREATE_BAD_STEP_DESCRIPTION')
    };
}

function parseUtensil(item: unknown, index: number): RecipeUtensilInput {
    if (!isRecord(item))
        throw badRequest(`Utensil #${index + 1} is invalid`, 'RECIPES_CREATE_BAD_UTENSIL');

    return {
        utensilId: getRequiredNumber(item.utensilId, 'UtensilId must be a number', 'RECIPES_CREATE_BAD_UTENSIL_ID')
    };
}

function parseTagId(item: unknown): number {
    return getRequiredPositiveInteger(item, 'TagId must be a positive integer', 'RECIPES_CREATE_BAD_TAG_ID');
}

function parseRecipeContentBody(body: unknown, codePrefix: 'RECIPES_CREATE' | 'RECIPES_UPDATE'): RecipeBody {
    if (!isRecord(body))
        throw badRequest('Invalid body', `${codePrefix}_BAD_BODY`);

    const title = getRequiredString(body.title, 'Title is required', `${codePrefix}_MISSING_TITLE`);

    if (title.length < 5)
        throw badRequest('Title must be at least 5 characters', `${codePrefix}_WEAK_TITLE`);

    const categoryId = getOptionalNullableNumber(body.categoryId, 'Category must be a number', `${codePrefix}_BAD_CATEGORY`);
    const description = getOptionalString(body.description, 'Description must be a string', `${codePrefix}_BAD_DESCRIPTION`);
    const coverImageUrl = getOptionalNullableString(body.coverImageUrl, 'Cover image URL must be a string or null', `${codePrefix}_BAD_COVER_IMAGE_URL`);
    const prepTimeMinutes = getOptionalNumber(body.prepTimeMinutes, 'Prep time must be a number', `${codePrefix}_BAD_PREP_TIME`);
    const restTimeMinutes = getOptionalNullableNumber(body.restTimeMinutes, 'Rest time must be a number', `${codePrefix}_BAD_REST_TIME`);
    const cookTimeMinutes = getOptionalNullableNumber(body.cookTimeMinutes, 'Cook time must be a number', `${codePrefix}_BAD_COOK_TIME`);
    const servings = getOptionalNumber(body.servings, 'Servings must be a number', `${codePrefix}_BAD_SERVINGS`);
    const tagIds = getOptionalArray(body.tagIds, parseTagId, 'Tags must be an array', `${codePrefix}_BAD_TAGS`);
    const ingredients = getOptionalArray(body.ingredients, parseIngredient, 'Ingredients must be an array', `${codePrefix}_BAD_INGREDIENTS`);
    const steps = getOptionalArray(body.steps, parseStep, 'Steps must be an array', `${codePrefix}_BAD_STEPS`);
    const utensils = getOptionalArray(body.utensils, parseUtensil, 'Utensils must be an array', `${codePrefix}_BAD_UTENSILS`);

    return { categoryId, title, description, coverImageUrl, prepTimeMinutes, restTimeMinutes, cookTimeMinutes, servings, tagIds, ingredients, steps, utensils };
}

export function parseCreateRecipeBody(body: unknown): CreateRecipeBody {
    return parseRecipeContentBody(body, 'RECIPES_CREATE');
}

export function parseUpdateRecipeBody(body: unknown): UpdateRecipeBody {
    return parseRecipeContentBody(body, 'RECIPES_UPDATE');
}

export function parseRecipeIdParam(value: unknown): number {
    const recipeId = typeof value === 'string' ? Number(value) : NaN;

    if (!Number.isInteger(recipeId) || recipeId <= 0)
        throw badRequest('Recipe id must be a positive integer', 'RECIPES_BAD_ID');

    return recipeId;
}
