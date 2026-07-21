import { badRequest } from '../../utils/errors.js';
import { isRecord } from '../http/dto.helpers.js';

import type { AdminIngredientAliasListFilters, AdminIngredientListFilters } from '../../repositories/admin/admin.ingredients.types.js';
import type { IngredientStatus } from '../../repositories/ingredients/ingredient.types.js';
import type {
    AdminCreateIngredientAliasCommand,
    AdminCreateIngredientCommand,
    AdminMergeIngredientCommand,
    AdminUpdateIngredientAliasCommand,
    AdminUpdateIngredientCommand
} from '../../services/admin/admin.ingredients.service.js';

const INGREDIENT_STATUSES = new Set<IngredientStatus>(['active', 'deprecated', 'merged']);
const NAME_MAX_LENGTH = 255;
const SLUG_MAX_LENGTH = 255;
const SEARCH_MAX_LENGTH = 255;
const LANGUAGE_CODE_MAX_LENGTH = 35;
const ACTION_REASON_MIN_LENGTH = 10;
const ACTION_REASON_MAX_LENGTH = 1000;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LANGUAGE_CODE_PATTERN = /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/;

export function parseAdminIngredientIdParam(value: unknown): number {
    return parseIdParam(value, 'Ingredient id', 'ADMIN_INGREDIENTS_BAD_ID');
}

export function parseAdminIngredientAliasIdParam(value: unknown): number {
    return parseIdParam(value, 'Ingredient alias id', 'ADMIN_INGREDIENT_ALIASES_BAD_ID');
}

export function parseAdminIngredientListFilters(query: unknown): AdminIngredientListFilters {
    if (!isRecord(query) || Array.isArray(query))
        throw badRequest('Invalid ingredient query', 'ADMIN_INGREDIENTS_BAD_QUERY');

    const status = parseOptionalStatus(query.status);
    const q = parseOptionalSearch(query.q, 'Ingredient', 'ADMIN_INGREDIENTS_BAD_SEARCH');

    return {
        ...(status === undefined ? {} : { status }),
        ...(q === undefined ? {} : { q })
    };
}

export function parseAdminIngredientAliasListFilters(query: unknown): AdminIngredientAliasListFilters {
    if (!isRecord(query) || Array.isArray(query))
        throw badRequest('Invalid ingredient alias query', 'ADMIN_INGREDIENT_ALIASES_BAD_QUERY');

    const languageCode = query.languageCode === undefined ? undefined : parseLanguageCode(query.languageCode);
    const q = parseOptionalSearch(query.q, 'Ingredient alias', 'ADMIN_INGREDIENT_ALIASES_BAD_SEARCH');

    return {
        ...(languageCode === undefined ? {} : { languageCode }),
        ...(q === undefined ? {} : { q })
    };
}

export function parseCreateAdminIngredientBody(body: unknown): AdminCreateIngredientCommand {
    if (!isRecord(body) || Array.isArray(body))
        throw badRequest('Invalid ingredient body', 'ADMIN_INGREDIENTS_CREATE_BAD_BODY');

    const slug = parseOptionalSlug(body.slug);

    return {
        name: parseRequiredName(body.name, 'Ingredient', 'ADMIN_INGREDIENTS'),
        ...(slug === undefined ? {} : { slug })
    };
}

export function parseUpdateAdminIngredientBody(body: unknown): AdminUpdateIngredientCommand {
    if (!isRecord(body) || Array.isArray(body))
        throw badRequest('Invalid ingredient body', 'ADMIN_INGREDIENTS_UPDATE_BAD_BODY');

    const name = body.name === undefined ? undefined : parseRequiredName(body.name, 'Ingredient', 'ADMIN_INGREDIENTS');
    const slug = parseOptionalSlug(body.slug);

    if (name === undefined && slug === undefined)
        throw badRequest('At least one ingredient field must be provided', 'ADMIN_INGREDIENTS_UPDATE_EMPTY');

    return {
        ...(name === undefined ? {} : { name }),
        ...(slug === undefined ? {} : { slug })
    };
}

export function parseAdminIngredientActionReasonBody(body: unknown, action: 'deprecate' | 'restore'): string {
    if (!isRecord(body) || Array.isArray(body))
        throw badRequest('Invalid ingredient action body', `ADMIN_INGREDIENTS_${action.toUpperCase()}_BAD_BODY`);

    return parseReason(body.reason, action);
}

export function parseMergeAdminIngredientBody(body: unknown): AdminMergeIngredientCommand {
    if (!isRecord(body) || Array.isArray(body))
        throw badRequest('Invalid ingredient merge body', 'ADMIN_INGREDIENTS_MERGE_BAD_BODY');

    return {
        targetIngredientId: parseBodyId(body.targetIngredientId, 'Merge target ingredient id', 'ADMIN_INGREDIENTS_MERGE_BAD_TARGET_ID'),
        reason: parseReason(body.reason, 'merge')
    };
}

export function parseCreateAdminIngredientAliasBody(body: unknown): AdminCreateIngredientAliasCommand {
    if (!isRecord(body) || Array.isArray(body))
        throw badRequest('Invalid ingredient alias body', 'ADMIN_INGREDIENT_ALIASES_CREATE_BAD_BODY');

    return {
        name: parseRequiredName(body.name, 'Ingredient alias', 'ADMIN_INGREDIENT_ALIASES'),
        languageCode: parseLanguageCode(body.languageCode)
    };
}

export function parseUpdateAdminIngredientAliasBody(body: unknown): AdminUpdateIngredientAliasCommand {
    if (!isRecord(body) || Array.isArray(body))
        throw badRequest('Invalid ingredient alias body', 'ADMIN_INGREDIENT_ALIASES_UPDATE_BAD_BODY');

    const name = body.name === undefined ? undefined : parseRequiredName(body.name, 'Ingredient alias', 'ADMIN_INGREDIENT_ALIASES');
    const languageCode = body.languageCode === undefined ? undefined : parseLanguageCode(body.languageCode);

    if (name === undefined && languageCode === undefined)
        throw badRequest('At least one ingredient alias field must be provided', 'ADMIN_INGREDIENT_ALIASES_UPDATE_EMPTY');

    return {
        ...(name === undefined ? {} : { name }),
        ...(languageCode === undefined ? {} : { languageCode })
    };
}

function parseIdParam(value: unknown, label: string, code: string): number {
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))
        throw badRequest(`${label} must be a positive integer`, code);

    const id = Number(value);
    if (!Number.isSafeInteger(id))
        throw badRequest(`${label} must be a positive integer`, code);

    return id;
}

function parseBodyId(value: unknown, label: string, code: string): number {
    if (!Number.isSafeInteger(value) || Number(value) <= 0)
        throw badRequest(`${label} must be a positive integer`, code);

    return Number(value);
}

function parseOptionalStatus(value: unknown): IngredientStatus | undefined {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string' || !INGREDIENT_STATUSES.has(value as IngredientStatus))
        throw badRequest('Ingredient status must be active, deprecated or merged', 'ADMIN_INGREDIENTS_BAD_STATUS');

    return value as IngredientStatus;
}

function parseOptionalSearch(value: unknown, label: string, code: string): string | undefined {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string')
        throw badRequest(`${label} search must be a non-empty string`, code);

    const q = value.trim();
    if (!q || q.length > SEARCH_MAX_LENGTH)
        throw badRequest(`${label} search must contain at most ${SEARCH_MAX_LENGTH} characters`, code);

    return q;
}

function parseRequiredName(value: unknown, label: string, codePrefix: string): string {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name)
        throw badRequest(`${label} name is required`, `${codePrefix}_NAME_REQUIRED`);
    if (name.length > NAME_MAX_LENGTH)
        throw badRequest(`${label} name must be at most ${NAME_MAX_LENGTH} characters`, `${codePrefix}_NAME_TOO_LONG`);

    return name;
}

function parseOptionalSlug(value: unknown): string | undefined {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string')
        throw badRequest('Ingredient slug is invalid', 'ADMIN_INGREDIENTS_SLUG_INVALID');

    const slug = value.trim();
    if (!slug || slug.length > SLUG_MAX_LENGTH || !SLUG_PATTERN.test(slug))
        throw badRequest('Ingredient slug must contain lowercase letters, numbers and single hyphens', 'ADMIN_INGREDIENTS_SLUG_INVALID');

    return slug;
}

function parseLanguageCode(value: unknown): string {
    const languageCode = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!languageCode || languageCode.length > LANGUAGE_CODE_MAX_LENGTH || !LANGUAGE_CODE_PATTERN.test(languageCode))
        throw badRequest('Ingredient alias language code is invalid', 'ADMIN_INGREDIENT_ALIASES_LANGUAGE_CODE_INVALID');

    return languageCode;
}

function parseReason(value: unknown, action: 'deprecate' | 'restore' | 'merge'): string {
    const reason = typeof value === 'string' ? value.trim() : '';
    const codePrefix = `ADMIN_INGREDIENTS_${action.toUpperCase()}`;

    if (!reason)
        throw badRequest('Action reason is required', `${codePrefix}_REASON_REQUIRED`);
    if (reason.length < ACTION_REASON_MIN_LENGTH)
        throw badRequest(`Action reason must be at least ${ACTION_REASON_MIN_LENGTH} characters`, `${codePrefix}_REASON_TOO_SHORT`);
    if (reason.length > ACTION_REASON_MAX_LENGTH)
        throw badRequest(`Action reason must be at most ${ACTION_REASON_MAX_LENGTH} characters`, `${codePrefix}_REASON_TOO_LONG`);

    return reason;
}
