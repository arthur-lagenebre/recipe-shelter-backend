import { badRequest } from '../../utils/errors.js';
import { getOptionalArray, getOptionalNullableNumber, getOptionalNullableString, getOptionalNumber, getOptionalString, getRequiredNumber, getRequiredPositiveInteger, getRequiredString, isRecord } from '../http/dto.helpers.js';

import type { RecipeIngredientInput, RecipeStepInput, RecipeEquipmentInput } from '../../repositories/recipes/recipe.types.js';
import type { RecipeSearchFilters } from '../../repositories/recipes/recipe.types.js';

export type RecipeBody = {
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

export type CreateRecipeBody = RecipeBody;
export type UpdateRecipeBody = RecipeBody;

export type RecipeSearchQuery = RecipeSearchFilters;

const DEFAULT_RECIPE_FEED_LIMIT = 12;
const MAX_RECIPE_FEED_LIMIT = 20;

function parseIngredient(item: unknown, index: number): RecipeIngredientInput {
    if (!isRecord(item))
        throw badRequest(`Ingredient #${index + 1} is invalid`, 'RECIPES_CREATE_BAD_INGREDIENT');

    const unit = getOptionalNullableString(item.unit, 'Ingredient unit must be a string or null', 'RECIPES_CREATE_BAD_INGREDIENT_UNIT');
    const note = getOptionalString(item.note, 'Ingredient note must be a string', 'RECIPES_CREATE_BAD_INGREDIENT_NOTE');
    const sortOrder = getOptionalNumber(item.sortOrder, 'Ingredient sortOrder must be a number', 'RECIPES_CREATE_BAD_INGREDIENT_SORT_ORDER');

    return {
        ingredientId: getRequiredNumber(item.ingredientId, 'IngredientId must be a number', 'RECIPES_CREATE_BAD_INGREDIENT_ID'),
        quantity: getOptionalNullableNumber(item.quantity, 'Ingredient quantity must be a number or null', 'RECIPES_CREATE_BAD_INGREDIENT_QUANTITY'),
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

function parseEquipment(item: unknown, index: number): RecipeEquipmentInput {
    if (!isRecord(item))
        throw badRequest(`Equipment #${index + 1} is invalid`, 'RECIPES_CREATE_BAD_EQUIPMENT');

    return {
        equipmentId: getRequiredNumber(item.equipmentId, 'EquipmentId must be a number', 'RECIPES_CREATE_BAD_EQUIPMENT_ID')
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
    const prepTimeMinutes = getOptionalNumber(body.prepTimeMinutes, 'Prep time must be a number', `${codePrefix}_BAD_PREP_TIME`);
    const restTimeMinutes = getOptionalNullableNumber(body.restTimeMinutes, 'Rest time must be a number', `${codePrefix}_BAD_REST_TIME`);
    const cookTimeMinutes = getOptionalNullableNumber(body.cookTimeMinutes, 'Cook time must be a number', `${codePrefix}_BAD_COOK_TIME`);
    const servings = getOptionalNumber(body.servings, 'Servings must be a number', `${codePrefix}_BAD_SERVINGS`);
    const tagIds = getOptionalArray(body.tagIds, parseTagId, 'Tags must be an array', `${codePrefix}_BAD_TAGS`);
    const ingredients = getOptionalArray(body.ingredients, parseIngredient, 'Ingredients must be an array', `${codePrefix}_BAD_INGREDIENTS`);
    const steps = getOptionalArray(body.steps, parseStep, 'Steps must be an array', `${codePrefix}_BAD_STEPS`);
    const equipments = getOptionalArray(body.equipments, parseEquipment, 'Equipments must be an array', `${codePrefix}_BAD_EQUIPMENTS`);

    return { categoryId, title, description, prepTimeMinutes, restTimeMinutes, cookTimeMinutes, servings, tagIds, ingredients, steps, equipments };
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

export function parseRecipeFeedLimitQuery(query: unknown): number {
    if (!isRecord(query))
        throw badRequest('Invalid query', 'RECIPES_FEED_BAD_QUERY');

    if (query.limit === undefined)
        return DEFAULT_RECIPE_FEED_LIMIT;

    const requestedLimit = parsePositiveIntegerQueryValue(query.limit, 'Limit must be a positive integer', 'RECIPES_FEED_BAD_LIMIT');

    return Math.min(requestedLimit, MAX_RECIPE_FEED_LIMIT);
}

function parsePositiveIntegerQueryValue(value: unknown, message: string, code: string): number {
    if (typeof value !== 'string')
        throw badRequest(message, code);

    const parsedValue = Number(value);
    if (!Number.isInteger(parsedValue) || parsedValue <= 0)
        throw badRequest(message, code);

    return parsedValue;
}

function parseCommaSeparatedPositiveIntegerQueryValue(value: unknown, message: string, code: string): number[] {
    if (typeof value !== 'string')
        throw badRequest(message, code);

    const values = new Set<number>();

    for (const rawPart of value.split(',')) {
        const part = rawPart.trim();
        if (!/^[1-9]\d*$/.test(part))
            throw badRequest(message, code);

        const parsedValue = Number(part);
        if (!Number.isSafeInteger(parsedValue))
            throw badRequest(message, code);

        values.add(parsedValue);
    }

    return [...values];
}

function parseTagIdsQueryValue(value: unknown): number[] {
    return parseCommaSeparatedPositiveIntegerQueryValue(value, 'Tag ids must be a comma-separated list of positive integers', 'RECIPES_SEARCH_BAD_TAGS');
}

function parseExcludedTagIdsQueryValue(value: unknown): number[] {
    return parseCommaSeparatedPositiveIntegerQueryValue(value, 'Excluded tag ids must be a comma-separated list of positive integers', 'RECIPES_SEARCH_BAD_EXCLUDED_TAGS');
}

function parseIngredientIdsQueryValue(value: unknown): number[] {
    return parseCommaSeparatedPositiveIntegerQueryValue(value, 'Ingredient ids must be a comma-separated list of positive integers', 'RECIPES_SEARCH_BAD_INGREDIENTS');
}

function parseExcludedIngredientIdsQueryValue(value: unknown): number[] {
    return parseCommaSeparatedPositiveIntegerQueryValue(value, 'Excluded ingredient ids must be a comma-separated list of positive integers', 'RECIPES_SEARCH_BAD_EXCLUDED_INGREDIENTS');
}

function assertNoSearchFilterConflict(includedIds: number[] | undefined, excludedIds: number[] | undefined, message: string, code: string): void {
    if (!includedIds?.length || !excludedIds?.length)
        return;

    const excludedIdSet = new Set(excludedIds);
    if (includedIds.some((id) => excludedIdSet.has(id)))
        throw badRequest(message, code);
}

export function parseRecipeSearchQuery(query: unknown): RecipeSearchQuery {
    if (!isRecord(query))
        throw badRequest('Invalid query', 'RECIPES_SEARCH_BAD_QUERY');

    const filters: RecipeSearchQuery = {};

    if (query.q !== undefined) {
        if (typeof query.q !== 'string')
            throw badRequest('Search query must be a string', 'RECIPES_SEARCH_BAD_Q');

        const q = query.q.trim();
        if (q)
            filters.q = q;
    }

    if (query.categoryId !== undefined)
        filters.categoryId = parsePositiveIntegerQueryValue(query.categoryId, 'Category id must be a positive integer', 'RECIPES_SEARCH_BAD_CATEGORY');

    if (query.tagIds !== undefined) {
        const tagIds = parseTagIdsQueryValue(query.tagIds);
        if (tagIds.length)
            filters.tagIds = tagIds;
    }

    if (query.excludedTagIds !== undefined) {
        const excludedTagIds = parseExcludedTagIdsQueryValue(query.excludedTagIds);
        if (excludedTagIds.length)
            filters.excludedTagIds = excludedTagIds;
    }

    if (query.ingredientIds !== undefined) {
        const ingredientIds = parseIngredientIdsQueryValue(query.ingredientIds);
        if (ingredientIds.length)
            filters.ingredientIds = ingredientIds;
    }

    if (query.excludedIngredientIds !== undefined) {
        const excludedIngredientIds = parseExcludedIngredientIdsQueryValue(query.excludedIngredientIds);
        if (excludedIngredientIds.length)
            filters.excludedIngredientIds = excludedIngredientIds;
    }

    assertNoSearchFilterConflict(filters.tagIds, filters.excludedTagIds, 'A tag id cannot be both included and excluded', 'RECIPES_SEARCH_TAG_FILTER_CONFLICT');
    assertNoSearchFilterConflict(filters.ingredientIds, filters.excludedIngredientIds, 'An ingredient id cannot be both included and excluded', 'RECIPES_SEARCH_INGREDIENT_FILTER_CONFLICT');

    if (query.maxTotalTimeMinutes !== undefined)
        filters.maxTotalTimeMinutes = parsePositiveIntegerQueryValue(query.maxTotalTimeMinutes, 'Total time must be a positive integer', 'RECIPES_SEARCH_BAD_TOTAL_TIME');

    return filters;
}
