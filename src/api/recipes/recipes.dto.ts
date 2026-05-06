import { badRequest } from '../../utils/errors.js';
import { getOptionalArray, getOptionalNullableNumber, getOptionalNullableString, getOptionalNumber, getOptionalString, getRequiredNumber, getRequiredPositiveInteger, getRequiredString, isRecord } from '../http/dto.helpers.js';

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

export function parseRecipeSlugParam(value: unknown): string {
    const slug = typeof value === 'string' ? value.trim() : '';

    if (!slug)
        throw badRequest('Recipe slug is required', 'RECIPES_BAD_SLUG');

    return slug;
}