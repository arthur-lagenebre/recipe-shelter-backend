import { ADMIN_AUDIT_EVENT_TYPES, ADMIN_AUDIT_TARGET_TYPES } from './admin.audit.events.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';

import type { AdminAuditActionRunner } from './admin.audit-action.runner.js';
import type { AdminAuditRequestContext } from './admin.audit.service.js';
import type { AdminIngredientRepository } from '../../repositories/admin/admin.ingredients.repository.interface.js';
import type { AdminIngredientAliasWriteResult, AdminIngredientWriteResult } from '../../repositories/admin/admin.ingredients.types.js';
import type { AdminTagRepository } from '../../repositories/admin/admin.tags.repository.interface.js';
import type { AdminTagWriteResult } from '../../repositories/admin/admin.tags.types.js';
import type { AdminCatalogProposalRepository } from '../../repositories/catalog/catalog-proposals.repository.interface.js';
import type {
    CatalogProposal,
    CatalogProposalListFilters,
    CatalogProposalType
} from '../../repositories/catalog/catalog-proposals.types.js';
import type { Ingredient, IngredientAlias } from '../../repositories/ingredients/ingredient.types.js';
import type { Tag } from '../../repositories/tag/tag.types.js';
import type { PaginatedResult, PaginationOptions } from '../../utils/pagination.js';

const SLUG_MAX_LENGTH = 255;
const DESCRIPTION_MAX_LENGTH = 1000;
const LANGUAGE_CODE_MAX_LENGTH = 35;
const SEARCH_MAX_LENGTH = 255;
const ACTION_REASON_MIN_LENGTH = 10;
const ACTION_REASON_MAX_LENGTH = 1000;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LANGUAGE_CODE_PATTERN = /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/;
const PROPOSAL_TYPES = new Set<CatalogProposalType>(['tag', 'ingredient']);
const PROPOSAL_STATUSES = new Set<CatalogProposal['status']>(['pending', 'accepted', 'rejected', 'merged']);

type ReviewAction = 'accept' | 'reject' | 'associate' | 'alias';

export type AcceptTagCatalogProposalCommand = {
    groupId: number;
    slug?: string;
    description?: string | null;
    reason: string;
};

export type AcceptIngredientCatalogProposalCommand = {
    slug?: string;
    reason: string;
};

export type AssociateTagCatalogProposalCommand = {
    targetTagId: number;
    reason: string;
};

export type AssociateIngredientCatalogProposalCommand = {
    targetIngredientId: number;
    reason: string;
};

export type ConvertCatalogProposalToAliasCommand = {
    targetIngredientId: number;
    languageCode: string;
    reason: string;
};

export class AdminCatalogProposalService {
    constructor(
        private readonly proposals: AdminCatalogProposalRepository,
        private readonly tags: AdminTagRepository,
        private readonly ingredients: AdminIngredientRepository,
        private readonly auditActions: AdminAuditActionRunner
    ) {}

    async list(
        filters: CatalogProposalListFilters,
        pagination: PaginationOptions,
        actorUserId: number,
        context: AdminAuditRequestContext
    ): Promise<PaginatedResult<CatalogProposal>> {
        const cleanFilters = validateListFilters(filters);

        return this.auditActions.run(async ({ db, audit }) => {
            const result = await this.proposals.find(cleanFilters, pagination, db);

            await audit.record({
                actorUserId,
                eventType: ADMIN_AUDIT_EVENT_TYPES.catalogProposalsList,
                targetType: ADMIN_AUDIT_TARGET_TYPES.catalogProposalCollection,
                targetId: 'all',
                afterValues: {
                    resultCount: result.items.length,
                    totalItems: result.pagination.totalItems,
                    page: result.pagination.page,
                    limit: result.pagination.limit,
                    filters: snapshotFilters(cleanFilters)
                },
                ...context
            });

            return result;
        });
    }

    async acceptTag(
        proposalId: number,
        input: AcceptTagCatalogProposalCommand,
        actorUserId: number,
        context: AdminAuditRequestContext
    ): Promise<CatalogProposal> {
        requirePositiveId(proposalId, 'Catalog proposal id', 'ADMIN_CATALOG_PROPOSALS_BAD_ID');
        const command = validateAcceptTagCommand(input);

        return this.auditActions.run(async ({ db, audit }) => {
            const before = await this.requirePendingProposal(proposalId, 'tag', db);
            if (!(await this.tags.groupExists(command.groupId, db)))
                throw notFound('Tag group not found', 'ADMIN_CATALOG_PROPOSALS_TAG_GROUP_NOT_FOUND');
            await this.requireUnusedCatalogName(before, db);

            const tag = requireWrittenTag(
                await this.tags.create(
                    {
                        groupId: command.groupId,
                        name: before.proposedName,
                        normalizedName: before.normalizedName,
                        slug: command.slug ?? before.normalizedName.replace(/ /g, '-'),
                        description: command.description
                    },
                    db
                )
            );
            const after = await this.reviewProposal(before, 'accepted', tag.id, actorUserId, command.reason, db);

            await audit.record({
                actorUserId,
                eventType: ADMIN_AUDIT_EVENT_TYPES.catalogProposalsAccept,
                targetType: ADMIN_AUDIT_TARGET_TYPES.catalogProposal,
                targetId: proposalId,
                reason: command.reason,
                beforeValues: snapshotProposal(before),
                afterValues: { proposal: snapshotProposal(after), createdTag: snapshotTag(tag) },
                ...context
            });

            return after;
        });
    }

    async acceptIngredient(
        proposalId: number,
        input: AcceptIngredientCatalogProposalCommand,
        actorUserId: number,
        context: AdminAuditRequestContext
    ): Promise<CatalogProposal> {
        requirePositiveId(proposalId, 'Catalog proposal id', 'ADMIN_CATALOG_PROPOSALS_BAD_ID');
        const command = validateAcceptIngredientCommand(input);

        return this.auditActions.run(async ({ db, audit }) => {
            const before = await this.requirePendingProposal(proposalId, 'ingredient', db);
            await this.requireUnusedCatalogName(before, db);
            const ingredient = requireWrittenIngredient(
                await this.ingredients.create(
                    {
                        name: before.proposedName,
                        normalizedName: before.normalizedName,
                        slug: command.slug ?? before.normalizedName.replace(/ /g, '-')
                    },
                    db
                )
            );
            const after = await this.reviewProposal(before, 'accepted', ingredient.id, actorUserId, command.reason, db);

            await audit.record({
                actorUserId,
                eventType: ADMIN_AUDIT_EVENT_TYPES.catalogProposalsAccept,
                targetType: ADMIN_AUDIT_TARGET_TYPES.catalogProposal,
                targetId: proposalId,
                reason: command.reason,
                beforeValues: snapshotProposal(before),
                afterValues: { proposal: snapshotProposal(after), createdIngredient: snapshotIngredient(ingredient) },
                ...context
            });

            return after;
        });
    }

    async reject(proposalId: number, reason: string, actorUserId: number, context: AdminAuditRequestContext): Promise<CatalogProposal> {
        requirePositiveId(proposalId, 'Catalog proposal id', 'ADMIN_CATALOG_PROPOSALS_BAD_ID');
        const cleanReason = validateActionReason(reason, 'reject');

        return this.auditActions.run(async ({ db, audit }) => {
            const before = await this.requirePendingProposal(proposalId, undefined, db);
            const after = await this.reviewProposal(before, 'rejected', null, actorUserId, cleanReason, db);

            await audit.record({
                actorUserId,
                eventType: ADMIN_AUDIT_EVENT_TYPES.catalogProposalsReject,
                targetType: ADMIN_AUDIT_TARGET_TYPES.catalogProposal,
                targetId: proposalId,
                reason: cleanReason,
                beforeValues: snapshotProposal(before),
                afterValues: snapshotProposal(after),
                ...context
            });

            return after;
        });
    }

    async associateTag(
        proposalId: number,
        input: AssociateTagCatalogProposalCommand,
        actorUserId: number,
        context: AdminAuditRequestContext
    ): Promise<CatalogProposal> {
        requirePositiveId(proposalId, 'Catalog proposal id', 'ADMIN_CATALOG_PROPOSALS_BAD_ID');
        const command = validateAssociateTagCommand(input);

        return this.auditActions.run(async ({ db, audit }) => {
            const before = await this.requirePendingProposal(proposalId, 'tag', db);
            const tag = (await this.tags.findByIdsForUpdate([command.targetTagId], db))[0];
            requireActiveTagTarget(tag);
            const after = await this.reviewProposal(before, 'merged', tag.id, actorUserId, command.reason, db);

            await audit.record({
                actorUserId,
                eventType: ADMIN_AUDIT_EVENT_TYPES.catalogProposalsAssociate,
                targetType: ADMIN_AUDIT_TARGET_TYPES.catalogProposal,
                targetId: proposalId,
                reason: command.reason,
                beforeValues: snapshotProposal(before),
                afterValues: { proposal: snapshotProposal(after), matchedTag: snapshotTag(tag) },
                ...context
            });

            return after;
        });
    }

    async associateIngredient(
        proposalId: number,
        input: AssociateIngredientCatalogProposalCommand,
        actorUserId: number,
        context: AdminAuditRequestContext
    ): Promise<CatalogProposal> {
        requirePositiveId(proposalId, 'Catalog proposal id', 'ADMIN_CATALOG_PROPOSALS_BAD_ID');
        const command = validateAssociateIngredientCommand(input);

        return this.auditActions.run(async ({ db, audit }) => {
            const before = await this.requirePendingProposal(proposalId, 'ingredient', db);
            const ingredient = (await this.ingredients.findByIdsForUpdate([command.targetIngredientId], db))[0];
            requireActiveIngredientTarget(ingredient);
            const after = await this.reviewProposal(before, 'merged', ingredient.id, actorUserId, command.reason, db);

            await audit.record({
                actorUserId,
                eventType: ADMIN_AUDIT_EVENT_TYPES.catalogProposalsAssociate,
                targetType: ADMIN_AUDIT_TARGET_TYPES.catalogProposal,
                targetId: proposalId,
                reason: command.reason,
                beforeValues: snapshotProposal(before),
                afterValues: { proposal: snapshotProposal(after), matchedIngredient: snapshotIngredient(ingredient) },
                ...context
            });

            return after;
        });
    }

    async convertIngredientToAlias(
        proposalId: number,
        input: ConvertCatalogProposalToAliasCommand,
        actorUserId: number,
        context: AdminAuditRequestContext
    ): Promise<CatalogProposal> {
        requirePositiveId(proposalId, 'Catalog proposal id', 'ADMIN_CATALOG_PROPOSALS_BAD_ID');
        const command = validateAliasCommand(input);

        return this.auditActions.run(async ({ db, audit }) => {
            const before = await this.requirePendingProposal(proposalId, 'ingredient', db);
            const ingredient = (await this.ingredients.findByIdsForUpdate([command.targetIngredientId], db))[0];
            requireActiveIngredientTarget(ingredient);
            await this.requireUnusedCatalogName(before, db);
            const alias = requireWrittenAlias(
                await this.ingredients.createAlias(
                    {
                        ingredientId: ingredient.id,
                        name: before.proposedName,
                        normalizedName: before.normalizedName,
                        languageCode: command.languageCode
                    },
                    db
                )
            );
            const after = await this.reviewProposal(before, 'merged', ingredient.id, actorUserId, command.reason, db);

            await audit.record({
                actorUserId,
                eventType: ADMIN_AUDIT_EVENT_TYPES.catalogProposalsAlias,
                targetType: ADMIN_AUDIT_TARGET_TYPES.catalogProposal,
                targetId: proposalId,
                reason: command.reason,
                beforeValues: snapshotProposal(before),
                afterValues: {
                    proposal: snapshotProposal(after),
                    matchedIngredient: snapshotIngredient(ingredient),
                    createdAlias: snapshotAlias(alias)
                },
                ...context
            });

            return after;
        });
    }

    private async requirePendingProposal(
        proposalId: number,
        expectedType: CatalogProposalType | undefined,
        db: Parameters<AdminCatalogProposalRepository['findByIdForUpdate']>[1]
    ): Promise<CatalogProposal> {
        const proposal = await this.proposals.findByIdForUpdate(proposalId, db);

        if (!proposal) throw notFound('Catalog proposal not found', 'ADMIN_CATALOG_PROPOSALS_NOT_FOUND');
        if (proposal.status !== 'pending')
            throw conflict('Catalog proposal has already been reviewed', 'ADMIN_CATALOG_PROPOSALS_ALREADY_REVIEWED');
        if (expectedType !== undefined && proposal.proposalType !== expectedType)
            throw conflict('Catalog proposal type does not match this action', 'ADMIN_CATALOG_PROPOSALS_TYPE_MISMATCH');

        return proposal;
    }

    private async requireUnusedCatalogName(
        proposal: CatalogProposal,
        db: Parameters<AdminCatalogProposalRepository['findByIdForUpdate']>[1]
    ): Promise<void> {
        if (await this.proposals.activeCatalogNameExists(proposal.proposalType, proposal.normalizedName, db))
            throw conflict('An active catalogue entry already uses this name', 'ADMIN_CATALOG_PROPOSALS_CANONICAL_NAME_TAKEN');
    }

    private async reviewProposal(
        proposal: CatalogProposal,
        status: 'accepted' | 'rejected' | 'merged',
        matchedCatalogId: number | null,
        actorUserId: number,
        reason: string,
        db: Parameters<AdminCatalogProposalRepository['review']>[1]
    ): Promise<CatalogProposal> {
        const reviewed = await this.proposals.review(
            {
                proposalId: proposal.id,
                status,
                matchedTagId: proposal.proposalType === 'tag' ? matchedCatalogId : null,
                matchedIngredientId: proposal.proposalType === 'ingredient' ? matchedCatalogId : null,
                reviewedByStaffUserId: actorUserId,
                reviewReason: reason
            },
            db
        );

        if (!reviewed) throw conflict('Catalog proposal status changed concurrently', 'ADMIN_CATALOG_PROPOSALS_STATUS_CONFLICT');

        return reviewed;
    }
}

function validateListFilters(filters: CatalogProposalListFilters): CatalogProposalListFilters {
    if (!filters || typeof filters !== 'object' || Array.isArray(filters))
        throw badRequest('Invalid catalog proposal query', 'ADMIN_CATALOG_PROPOSALS_BAD_QUERY');
    if (filters.status !== undefined && !PROPOSAL_STATUSES.has(filters.status))
        throw badRequest('Catalog proposal status is invalid', 'ADMIN_CATALOG_PROPOSALS_BAD_STATUS');
    if (filters.proposalType !== undefined && !PROPOSAL_TYPES.has(filters.proposalType))
        throw badRequest('Catalog proposal type is invalid', 'ADMIN_CATALOG_PROPOSALS_BAD_TYPE');
    if (filters.recipeId !== undefined) requirePositiveId(filters.recipeId, 'Recipe id', 'ADMIN_CATALOG_PROPOSALS_BAD_RECIPE_ID');
    if (filters.authorUserId !== undefined)
        requirePositiveId(filters.authorUserId, 'Author user id', 'ADMIN_CATALOG_PROPOSALS_BAD_AUTHOR_ID');
    if (filters.q !== undefined && (typeof filters.q !== 'string' || !filters.q.trim() || filters.q.trim().length > SEARCH_MAX_LENGTH))
        throw badRequest(
            `Catalog proposal search must contain at most ${SEARCH_MAX_LENGTH} characters`,
            'ADMIN_CATALOG_PROPOSALS_BAD_SEARCH'
        );

    return {
        ...filters,
        ...(filters.q === undefined ? {} : { q: filters.q.trim() })
    };
}

function validateAcceptTagCommand(input: AcceptTagCatalogProposalCommand) {
    requireCommand(input, 'accept');

    return {
        groupId: requirePositiveId(input.groupId, 'Tag group id', 'ADMIN_CATALOG_PROPOSALS_BAD_TAG_GROUP_ID'),
        slug: validateOptionalSlug(input.slug, 'tag'),
        description: validateOptionalDescription(input.description),
        reason: validateActionReason(input.reason, 'accept')
    };
}

function validateAcceptIngredientCommand(input: AcceptIngredientCatalogProposalCommand) {
    requireCommand(input, 'accept');

    return {
        slug: validateOptionalSlug(input.slug, 'ingredient'),
        reason: validateActionReason(input.reason, 'accept')
    };
}

function validateAssociateTagCommand(input: AssociateTagCatalogProposalCommand) {
    requireCommand(input, 'associate');

    return {
        targetTagId: requirePositiveId(input.targetTagId, 'Target tag id', 'ADMIN_CATALOG_PROPOSALS_BAD_TARGET_TAG_ID'),
        reason: validateActionReason(input.reason, 'associate')
    };
}

function validateAssociateIngredientCommand(input: AssociateIngredientCatalogProposalCommand) {
    requireCommand(input, 'associate');

    return {
        targetIngredientId: requirePositiveId(
            input.targetIngredientId,
            'Target ingredient id',
            'ADMIN_CATALOG_PROPOSALS_BAD_TARGET_INGREDIENT_ID'
        ),
        reason: validateActionReason(input.reason, 'associate')
    };
}

function validateAliasCommand(input: ConvertCatalogProposalToAliasCommand) {
    requireCommand(input, 'alias');

    const languageCode = typeof input.languageCode === 'string' ? input.languageCode.trim().toLowerCase() : '';
    if (!languageCode || languageCode.length > LANGUAGE_CODE_MAX_LENGTH || !LANGUAGE_CODE_PATTERN.test(languageCode))
        throw badRequest('Ingredient alias language code is invalid', 'ADMIN_CATALOG_PROPOSALS_ALIAS_LANGUAGE_CODE_INVALID');

    return {
        targetIngredientId: requirePositiveId(
            input.targetIngredientId,
            'Target ingredient id',
            'ADMIN_CATALOG_PROPOSALS_BAD_TARGET_INGREDIENT_ID'
        ),
        languageCode,
        reason: validateActionReason(input.reason, 'alias')
    };
}

function requireCommand(input: unknown, action: ReviewAction): asserts input is Record<string, unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        throw badRequest('Invalid catalog proposal action body', `ADMIN_CATALOG_PROPOSALS_${action.toUpperCase()}_BAD_BODY`);
}

function validateOptionalSlug(value: unknown, proposalType: CatalogProposalType): string | undefined {
    if (value === undefined) return undefined;

    const slug = typeof value === 'string' ? value.trim() : '';
    if (!slug || slug.length > SLUG_MAX_LENGTH || !SLUG_PATTERN.test(slug))
        throw badRequest(
            `${proposalType === 'tag' ? 'Tag' : 'Ingredient'} slug is invalid`,
            `ADMIN_CATALOG_PROPOSALS_${proposalType.toUpperCase()}_SLUG_INVALID`
        );

    return slug;
}

function validateOptionalDescription(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string')
        throw badRequest('Tag description must be a string or null', 'ADMIN_CATALOG_PROPOSALS_TAG_DESCRIPTION_INVALID');

    const description = value.trim();
    if (!description || description.length > DESCRIPTION_MAX_LENGTH)
        throw badRequest(
            'Tag description must be non-blank and at most 1000 characters',
            'ADMIN_CATALOG_PROPOSALS_TAG_DESCRIPTION_INVALID'
        );

    return description;
}

function validateActionReason(value: unknown, action: ReviewAction): string {
    const reason = typeof value === 'string' ? value.trim() : '';
    const codePrefix = `ADMIN_CATALOG_PROPOSALS_${action.toUpperCase()}`;

    if (!reason) throw badRequest('Review reason is required', `${codePrefix}_REASON_REQUIRED`);
    if (reason.length < ACTION_REASON_MIN_LENGTH)
        throw badRequest(`Review reason must be at least ${ACTION_REASON_MIN_LENGTH} characters`, `${codePrefix}_REASON_TOO_SHORT`);
    if (reason.length > ACTION_REASON_MAX_LENGTH)
        throw badRequest(`Review reason must be at most ${ACTION_REASON_MAX_LENGTH} characters`, `${codePrefix}_REASON_TOO_LONG`);

    return reason;
}

function requirePositiveId(value: unknown, label: string, code: string): number {
    if (!Number.isSafeInteger(value) || Number(value) <= 0) throw badRequest(`${label} must be a positive integer`, code);

    return Number(value);
}

function requireWrittenTag(result: AdminTagWriteResult): Tag {
    if (result.status === 'normalized_name_taken')
        throw conflict('An active tag already uses this canonical name', 'ADMIN_CATALOG_PROPOSALS_CANONICAL_NAME_TAKEN');
    if (result.status === 'slug_taken') throw conflict('A tag already uses this slug', 'ADMIN_CATALOG_PROPOSALS_TAG_SLUG_TAKEN');

    return result.tag;
}

function requireWrittenIngredient(result: AdminIngredientWriteResult): Ingredient {
    if (result.status === 'normalized_name_taken')
        throw conflict('An active ingredient already uses this canonical name', 'ADMIN_CATALOG_PROPOSALS_CANONICAL_NAME_TAKEN');
    if (result.status === 'slug_taken')
        throw conflict('An ingredient already uses this slug', 'ADMIN_CATALOG_PROPOSALS_INGREDIENT_SLUG_TAKEN');

    return result.ingredient;
}

function requireWrittenAlias(result: AdminIngredientAliasWriteResult): IngredientAlias {
    if (result.status === 'alias_taken')
        throw conflict('This normalized alias already exists for the language', 'ADMIN_CATALOG_PROPOSALS_ALIAS_TAKEN');

    return result.alias;
}

function requireActiveTagTarget(tag: Tag | undefined): asserts tag is Tag {
    if (!tag) throw notFound('Target tag not found', 'ADMIN_CATALOG_PROPOSALS_TARGET_TAG_NOT_FOUND');
    if (tag.status !== 'active') throw conflict('Target tag must be active', 'ADMIN_CATALOG_PROPOSALS_TARGET_TAG_NOT_ACTIVE');
}

function requireActiveIngredientTarget(ingredient: Ingredient | undefined): asserts ingredient is Ingredient {
    if (!ingredient) throw notFound('Target ingredient not found', 'ADMIN_CATALOG_PROPOSALS_TARGET_INGREDIENT_NOT_FOUND');
    if (ingredient.status !== 'active')
        throw conflict('Target ingredient must be active', 'ADMIN_CATALOG_PROPOSALS_TARGET_INGREDIENT_NOT_ACTIVE');
}

function snapshotFilters(filters: CatalogProposalListFilters) {
    return {
        status: filters.status ?? null,
        proposalType: filters.proposalType ?? null,
        recipeId: filters.recipeId ?? null,
        authorUserId: filters.authorUserId ?? null,
        q: filters.q ?? null
    };
}

function snapshotProposal(proposal: CatalogProposal) {
    return {
        authorUserId: proposal.authorUserId,
        recipeId: proposal.recipeId,
        proposalType: proposal.proposalType,
        proposedName: proposal.proposedName,
        normalizedName: proposal.normalizedName,
        status: proposal.status,
        matchedTagId: proposal.matchedTagId,
        matchedIngredientId: proposal.matchedIngredientId,
        reviewedByStaffUserId: proposal.reviewedByStaffUserId,
        reviewReason: proposal.reviewReason,
        createdAt: proposal.createdAt.toISOString(),
        reviewedAt: proposal.reviewedAt?.toISOString() ?? null
    };
}

function snapshotTag(tag: Tag) {
    return {
        id: tag.id,
        groupId: tag.group.id,
        name: tag.name,
        normalizedName: tag.normalizedName,
        slug: tag.slug,
        description: tag.description,
        status: tag.status
    };
}

function snapshotIngredient(ingredient: Ingredient) {
    return {
        id: ingredient.id,
        name: ingredient.name,
        normalizedName: ingredient.normalizedName,
        slug: ingredient.slug,
        status: ingredient.status
    };
}

function snapshotAlias(alias: IngredientAlias) {
    return {
        id: alias.id,
        ingredientId: alias.ingredientId,
        name: alias.name,
        normalizedName: alias.normalizedName,
        languageCode: alias.languageCode
    };
}
