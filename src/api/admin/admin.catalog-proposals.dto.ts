import { badRequest } from '../../utils/errors.js';
import { isRecord } from '../http/dto.helpers.js';

import type {
    CatalogProposalListFilters,
    CatalogProposalStatus,
    CatalogProposalType
} from '../../repositories/catalog/catalog-proposals.types.js';
import type {
    AcceptIngredientCatalogProposalCommand,
    AcceptTagCatalogProposalCommand,
    AssociateIngredientCatalogProposalCommand,
    AssociateTagCatalogProposalCommand,
    ConvertCatalogProposalToAliasCommand
} from '../../services/admin/admin.catalog-proposals.service.js';

const PROPOSAL_STATUSES = new Set<CatalogProposalStatus>(['pending', 'accepted', 'rejected', 'merged']);
const PROPOSAL_TYPES = new Set<CatalogProposalType>(['tag', 'ingredient']);
const SLUG_MAX_LENGTH = 255;
const DESCRIPTION_MAX_LENGTH = 1000;
const SEARCH_MAX_LENGTH = 255;
const LANGUAGE_CODE_MAX_LENGTH = 35;
const ACTION_REASON_MIN_LENGTH = 10;
const ACTION_REASON_MAX_LENGTH = 1000;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LANGUAGE_CODE_PATTERN = /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/;

type ReviewAction = 'accept' | 'reject' | 'associate' | 'alias';

export function parseAdminCatalogProposalIdParam(value: unknown): number {
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))
        throw badRequest('Catalog proposal id must be a positive integer', 'ADMIN_CATALOG_PROPOSALS_BAD_ID');

    const id = Number(value);
    if (!Number.isSafeInteger(id)) throw badRequest('Catalog proposal id must be a positive integer', 'ADMIN_CATALOG_PROPOSALS_BAD_ID');

    return id;
}

export function parseAdminCatalogProposalListFilters(query: unknown): CatalogProposalListFilters {
    if (!isRecord(query) || Array.isArray(query)) throw badRequest('Invalid catalog proposal query', 'ADMIN_CATALOG_PROPOSALS_BAD_QUERY');

    const status = query.status === undefined ? 'pending' : parseStatus(query.status);
    const proposalType = query.proposalType === undefined ? undefined : parseProposalType(query.proposalType);
    const recipeId =
        query.recipeId === undefined ? undefined : parseQueryId(query.recipeId, 'Recipe id', 'ADMIN_CATALOG_PROPOSALS_BAD_RECIPE_ID');
    const authorUserId =
        query.authorUserId === undefined
            ? undefined
            : parseQueryId(query.authorUserId, 'Author user id', 'ADMIN_CATALOG_PROPOSALS_BAD_AUTHOR_ID');
    const q = parseOptionalSearch(query.q);

    return {
        status,
        ...(proposalType === undefined ? {} : { proposalType }),
        ...(recipeId === undefined ? {} : { recipeId }),
        ...(authorUserId === undefined ? {} : { authorUserId }),
        ...(q === undefined ? {} : { q })
    };
}

export function parseAcceptTagCatalogProposalBody(body: unknown): AcceptTagCatalogProposalCommand {
    const record = requireBody(body, 'accept');
    const slug = parseOptionalSlug(record.slug, 'tag');
    const description = parseOptionalDescription(record.description);

    return {
        groupId: parseBodyId(record.groupId, 'Tag group id', 'ADMIN_CATALOG_PROPOSALS_BAD_TAG_GROUP_ID'),
        ...(slug === undefined ? {} : { slug }),
        ...(description === undefined ? {} : { description }),
        reason: parseReason(record.reason, 'accept')
    };
}

export function parseAcceptIngredientCatalogProposalBody(body: unknown): AcceptIngredientCatalogProposalCommand {
    const record = requireBody(body, 'accept');
    const slug = parseOptionalSlug(record.slug, 'ingredient');

    return {
        ...(slug === undefined ? {} : { slug }),
        reason: parseReason(record.reason, 'accept')
    };
}

export function parseRejectCatalogProposalBody(body: unknown): string {
    const record = requireBody(body, 'reject');
    return parseReason(record.reason, 'reject');
}

export function parseAssociateTagCatalogProposalBody(body: unknown): AssociateTagCatalogProposalCommand {
    const record = requireBody(body, 'associate');

    return {
        targetTagId: parseBodyId(record.targetTagId, 'Target tag id', 'ADMIN_CATALOG_PROPOSALS_BAD_TARGET_TAG_ID'),
        reason: parseReason(record.reason, 'associate')
    };
}

export function parseAssociateIngredientCatalogProposalBody(body: unknown): AssociateIngredientCatalogProposalCommand {
    const record = requireBody(body, 'associate');

    return {
        targetIngredientId: parseBodyId(
            record.targetIngredientId,
            'Target ingredient id',
            'ADMIN_CATALOG_PROPOSALS_BAD_TARGET_INGREDIENT_ID'
        ),
        reason: parseReason(record.reason, 'associate')
    };
}

export function parseConvertCatalogProposalToAliasBody(body: unknown): ConvertCatalogProposalToAliasCommand {
    const record = requireBody(body, 'alias');
    const languageCode = typeof record.languageCode === 'string' ? record.languageCode.trim().toLowerCase() : '';
    if (!languageCode || languageCode.length > LANGUAGE_CODE_MAX_LENGTH || !LANGUAGE_CODE_PATTERN.test(languageCode))
        throw badRequest('Ingredient alias language code is invalid', 'ADMIN_CATALOG_PROPOSALS_ALIAS_LANGUAGE_CODE_INVALID');

    return {
        targetIngredientId: parseBodyId(
            record.targetIngredientId,
            'Target ingredient id',
            'ADMIN_CATALOG_PROPOSALS_BAD_TARGET_INGREDIENT_ID'
        ),
        languageCode,
        reason: parseReason(record.reason, 'alias')
    };
}

function requireBody(body: unknown, action: ReviewAction): Record<string, unknown> {
    if (!isRecord(body) || Array.isArray(body))
        throw badRequest('Invalid catalog proposal action body', `ADMIN_CATALOG_PROPOSALS_${action.toUpperCase()}_BAD_BODY`);

    return body;
}

function parseStatus(value: unknown): CatalogProposalStatus {
    if (typeof value !== 'string' || !PROPOSAL_STATUSES.has(value as CatalogProposalStatus))
        throw badRequest('Catalog proposal status is invalid', 'ADMIN_CATALOG_PROPOSALS_BAD_STATUS');

    return value as CatalogProposalStatus;
}

function parseProposalType(value: unknown): CatalogProposalType {
    if (typeof value !== 'string' || !PROPOSAL_TYPES.has(value as CatalogProposalType))
        throw badRequest('Catalog proposal type is invalid', 'ADMIN_CATALOG_PROPOSALS_BAD_TYPE');

    return value as CatalogProposalType;
}

function parseQueryId(value: unknown, label: string, code: string): number {
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw badRequest(`${label} must be a positive integer`, code);

    const id = Number(value);
    if (!Number.isSafeInteger(id)) throw badRequest(`${label} must be a positive integer`, code);

    return id;
}

function parseBodyId(value: unknown, label: string, code: string): number {
    if (!Number.isSafeInteger(value) || Number(value) <= 0) throw badRequest(`${label} must be a positive integer`, code);

    return Number(value);
}

function parseOptionalSearch(value: unknown): string | undefined {
    if (value === undefined) return undefined;
    const q = typeof value === 'string' ? value.trim() : '';
    if (!q || q.length > SEARCH_MAX_LENGTH)
        throw badRequest(
            `Catalog proposal search must contain at most ${SEARCH_MAX_LENGTH} characters`,
            'ADMIN_CATALOG_PROPOSALS_BAD_SEARCH'
        );

    return q;
}

function parseOptionalSlug(value: unknown, proposalType: CatalogProposalType): string | undefined {
    if (value === undefined) return undefined;
    const slug = typeof value === 'string' ? value.trim() : '';
    if (!slug || slug.length > SLUG_MAX_LENGTH || !SLUG_PATTERN.test(slug))
        throw badRequest(
            `${proposalType === 'tag' ? 'Tag' : 'Ingredient'} slug is invalid`,
            `ADMIN_CATALOG_PROPOSALS_${proposalType.toUpperCase()}_SLUG_INVALID`
        );

    return slug;
}

function parseOptionalDescription(value: unknown): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const description = typeof value === 'string' ? value.trim() : '';
    if (!description || description.length > DESCRIPTION_MAX_LENGTH)
        throw badRequest(
            'Tag description must be non-blank and at most 1000 characters',
            'ADMIN_CATALOG_PROPOSALS_TAG_DESCRIPTION_INVALID'
        );

    return description;
}

function parseReason(value: unknown, action: ReviewAction): string {
    const reason = typeof value === 'string' ? value.trim() : '';
    const codePrefix = `ADMIN_CATALOG_PROPOSALS_${action.toUpperCase()}`;
    if (!reason) throw badRequest('Review reason is required', `${codePrefix}_REASON_REQUIRED`);
    if (reason.length < ACTION_REASON_MIN_LENGTH)
        throw badRequest(`Review reason must be at least ${ACTION_REASON_MIN_LENGTH} characters`, `${codePrefix}_REASON_TOO_SHORT`);
    if (reason.length > ACTION_REASON_MAX_LENGTH)
        throw badRequest(`Review reason must be at most ${ACTION_REASON_MAX_LENGTH} characters`, `${codePrefix}_REASON_TOO_LONG`);

    return reason;
}
