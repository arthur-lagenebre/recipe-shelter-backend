import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { createPaginatedResult } from '../../../src/utils/pagination.js';
import { AdminCatalogProposalService } from '../../../src/services/admin/admin.catalog-proposals.service.js';
import { HttpError } from '../../../src/utils/errors.js';
import { TestAdminAuditRecorder, testAdminAuditContext } from '../../helpers/admin-audit.js';

import type { AdminIngredientRepository } from '../../../src/repositories/admin/admin.ingredients.repository.interface.js';
import type { AdminIngredientAliasWriteInput, AdminIngredientWriteInput } from '../../../src/repositories/admin/admin.ingredients.types.js';
import type { AdminTagRepository } from '../../../src/repositories/admin/admin.tags.repository.interface.js';
import type { AdminTagWriteInput } from '../../../src/repositories/admin/admin.tags.types.js';
import type { AdminCatalogProposalRepository } from '../../../src/repositories/catalog/catalog-proposals.repository.interface.js';
import type { CatalogProposal, CatalogProposalListFilters, CatalogProposalType, ReviewCatalogProposalInput } from '../../../src/repositories/catalog/catalog-proposals.types.js';
import type { CreateEquipmentInput, EquipmentRepository } from '../../../src/repositories/equipments/equipment.repository.interface.js';
import type { Equipment } from '../../../src/repositories/equipments/equipment.types.js';
import type { Ingredient, IngredientAlias } from '../../../src/repositories/ingredients/ingredient.types.js';
import type { Tag } from '../../../src/repositories/tag/tag.types.js';
import type { PaginationOptions } from '../../../src/utils/pagination.js';

const actorUserId = 91;
const createdAt = new Date('2026-07-20T10:00:00.000Z');
const reviewedAt = new Date('2026-07-20T11:00:00.000Z');
const pagination: PaginationOptions = { page: 1, limit: 25, offset: 0 };

class FakeAdminCatalogProposalRepository implements AdminCatalogProposalRepository {
    readonly proposals = new Map<number, CatalogProposal>([
        [1, createProposal(1, 'tag', 'Cuisine solaire', 'cuisine solaire')],
        [2, createProposal(2, 'ingredient', 'Poudre de lune', 'poudre de lune')],
        [3, createProposal(3, 'tag', 'Style impossible', 'style impossible')],
        [4, createProposal(4, 'ingredient', 'Sucre lunaire', 'sucre lunaire')],
        [5, createProposal(5, 'equipment', 'Presse-agrumes solaire', 'presse agrumes solaire')],
        [6, createProposal(6, 'equipment', 'Chinois futuriste', 'chinois futuriste')]
    ]);
    readonly usedNames = new Set<string>();
    reviewConflict = false;
    lastFilters: CatalogProposalListFilters | null = null;

    async find(filters: CatalogProposalListFilters, page: PaginationOptions) {
        this.lastFilters = filters;
        const matching = [...this.proposals.values()].filter((proposal) => (filters.status === undefined || proposal.status === filters.status) && (filters.proposalType === undefined || proposal.proposalType === filters.proposalType) && (filters.recipeId === undefined || proposal.recipeId === filters.recipeId) && (filters.authorUserId === undefined || proposal.authorUserId === filters.authorUserId) && (filters.q === undefined || proposal.proposedName.toLowerCase().includes(filters.q.toLowerCase())));
        return createPaginatedResult(matching.map(cloneProposal), matching.length, page);
    }

    async findByIdForUpdate(proposalId: number): Promise<CatalogProposal | null> {
        const proposal = this.proposals.get(proposalId);
        return proposal ? cloneProposal(proposal) : null;
    }

    async activeCatalogNameExists(proposalType: CatalogProposalType, normalizedName: string): Promise<boolean> {
        return this.usedNames.has(`${proposalType}:${normalizedName}`);
    }

    async review(input: ReviewCatalogProposalInput): Promise<CatalogProposal | null> {
        if (this.reviewConflict)
            return null;
        const proposal = this.proposals.get(input.proposalId);
        if (!proposal || proposal.status !== 'pending')
            return null;

        Object.assign(proposal, {
            status: input.status,
            matchedTagId: input.matchedTagId,
            matchedIngredientId: input.matchedIngredientId,
            matchedEquipmentId: input.matchedEquipmentId,
            reviewedByStaffUserId: input.reviewedByStaffUserId,
            reviewReason: input.reviewReason,
            reviewedAt
        });
        return cloneProposal(proposal);
    }
}

class FakeCatalogTargets {
    readonly groups = new Set([8]);
    readonly tags = new Map<number, Tag>([
        [10, createTag(10, 'Cuisine du monde', 'cuisine du monde', 'cuisine-du-monde')],
        [11, createTag(11, 'Ancien tag', 'ancien tag', 'ancien-tag', 'deprecated')]
    ]);
    readonly ingredients = new Map<number, Ingredient>([
        [20, createIngredient(20, 'Sucre', 'sucre', 'sucre')],
        [21, createIngredient(21, 'Ancien sucre', 'ancien sucre', 'ancien-sucre', 'deprecated')]
    ]);
    readonly equipments = new Map<number, Equipment>([[30, createEquipment(30, 'Chinois', 'chinois', 'chinois')]]);
    readonly aliases: IngredientAlias[] = [];
    nextTagId = 100;
    nextIngredientId = 200;
    nextEquipmentId = 400;
    duplicateAlias = false;

    readonly tagRepository = {
        groupExists: async (groupId: number) => this.groups.has(groupId),
        findByIdsForUpdate: async (ids: number[]) =>
            ids.flatMap((id) => {
                const tag = this.tags.get(id);
                return tag ? [cloneTag(tag)] : [];
            }),
        create: async (input: AdminTagWriteInput) => {
            const tag = createTag(this.nextTagId++, input.name, input.normalizedName, input.slug);
            tag.group = { id: input.groupId, name: 'Groupe', slug: 'groupe', sortOrder: 8 };
            tag.description = input.description;
            this.tags.set(tag.id, tag);
            return { status: 'written' as const, tag: cloneTag(tag) };
        }
    } as unknown as AdminTagRepository;

    readonly ingredientRepository = {
        findByIdsForUpdate: async (ids: number[]) =>
            ids.flatMap((id) => {
                const ingredient = this.ingredients.get(id);
                return ingredient ? [cloneIngredient(ingredient)] : [];
            }),
        create: async (input: AdminIngredientWriteInput) => {
            const ingredient = createIngredient(this.nextIngredientId++, input.name, input.normalizedName, input.slug);
            this.ingredients.set(ingredient.id, ingredient);
            return { status: 'written' as const, ingredient: cloneIngredient(ingredient) };
        },
        createAlias: async (input: AdminIngredientAliasWriteInput) => {
            if (this.duplicateAlias)
                return { status: 'alias_taken' as const };
            const alias: IngredientAlias = {
                id: 300 + this.aliases.length,
                ingredientId: input.ingredientId,
                name: input.name,
                normalizedName: input.normalizedName,
                languageCode: input.languageCode,
                createdAt,
                updatedAt: createdAt
            };
            this.aliases.push(alias);
            return { status: 'written' as const, alias: { ...alias } };
        }
    } as unknown as AdminIngredientRepository;

    readonly equipmentRepository = {
        findByIdsForUpdate: async (ids: number[]) =>
            ids.flatMap((id) => {
                const equipment = this.equipments.get(id);
                return equipment ? [cloneEquipment(equipment)] : [];
            }),
        create: async (input: CreateEquipmentInput) => {
            const equipment = createEquipment(this.nextEquipmentId++, input.name, input.normalizedName, input.slug);
            this.equipments.set(equipment.id, equipment);
            return { status: 'written' as const, equipment: cloneEquipment(equipment) };
        }
    } as unknown as EquipmentRepository;
}

describe('AdminCatalogProposalService', () => {
    let proposals: FakeAdminCatalogProposalRepository;
    let targets: FakeCatalogTargets;
    let audit: TestAdminAuditRecorder;
    let service: AdminCatalogProposalService;

    beforeEach(() => {
        proposals = new FakeAdminCatalogProposalRepository();
        targets = new FakeCatalogTargets();
        audit = new TestAdminAuditRecorder();
        service = new AdminCatalogProposalService(proposals, targets.tagRepository, targets.ingredientRepository, targets.equipmentRepository, audit);
    });

    it('lists the filtered queue and audits the read', async () => {
        const result = await service.list(
            { status: 'pending', proposalType: 'ingredient', q: 'lune' },
            pagination,
            actorUserId,
            testAdminAuditContext
        );

        assert.deepEqual(
            result.items.map(({ id }) => id),
            [2]
        );
        assert.deepEqual(proposals.lastFilters, { status: 'pending', proposalType: 'ingredient', q: 'lune' });
        assert.deepEqual(
            {
                eventType: audit.inputs[0]?.eventType,
                targetType: audit.inputs[0]?.targetType,
                targetId: audit.inputs[0]?.targetId,
                filters: audit.inputs[0]?.afterValues?.filters
            },
            {
                eventType: 'catalog.proposals.list',
                targetType: 'catalog_proposal_collection',
                targetId: 'all',
                filters: { status: 'pending', proposalType: 'ingredient', recipeId: null, authorUserId: null, q: 'lune' }
            }
        );
    });

    it('accepts a tag by creating only the proposed canonical identity and auditing atomically', async () => {
        const reviewed = await service.acceptTag(
            1,
            {
                groupId: 8,
                slug: 'cuisine-du-futur',
                description: '  Une cuisine solaire.  ',
                reason: 'Proposition adaptée au catalogue.',
                name: 'Nom libre interdit'
            } as never,
            actorUserId,
            testAdminAuditContext
        );
        const created = targets.tags.get(reviewed.matchedTagId!);

        assert.deepEqual(
            created && {
                name: created.name,
                normalizedName: created.normalizedName,
                slug: created.slug,
                description: created.description,
                groupId: created.group.id
            },
            {
                name: 'Cuisine solaire',
                normalizedName: 'cuisine solaire',
                slug: 'cuisine-du-futur',
                description: 'Une cuisine solaire.',
                groupId: 8
            }
        );
        assert.equal(reviewed.status, 'accepted');
        assert.equal(reviewed.reviewedByStaffUserId, actorUserId);
        assert.equal(audit.inputs[0]?.eventType, 'catalog.proposals.accept');
        assert.equal(audit.inputs[0]?.targetId, 1);
        assert.deepEqual(audit.inputs[0]?.afterValues?.createdTag, {
            id: 100,
            groupId: 8,
            name: 'Cuisine solaire',
            normalizedName: 'cuisine solaire',
            slug: 'cuisine-du-futur',
            description: 'Une cuisine solaire.',
            status: 'active'
        });
    });

    it('accepts an ingredient with a generated slug and a single proposal audit', async () => {
        const reviewed = await service.acceptIngredient(
            2,
            {
                reason: 'Ingrédient canonique validé.'
            },
            actorUserId,
            testAdminAuditContext
        );
        const created = targets.ingredients.get(reviewed.matchedIngredientId!);

        assert.equal(reviewed.status, 'accepted');
        assert.equal(created?.name, 'Poudre de lune');
        assert.equal(created?.slug, 'poudre-de-lune');
        assert.equal(audit.inputs.length, 1);
        assert.deepEqual(audit.inputs[0]?.afterValues?.createdIngredient, {
            id: 200,
            name: 'Poudre de lune',
            normalizedName: 'poudre de lune',
            slug: 'poudre-de-lune',
            status: 'active'
        });
    });

    it('accepts an equipment with a slug derived from the normalized name and a single proposal audit', async () => {
        const reviewed = await service.acceptEquipment(
            5,
            {
                reason: 'Ustensile canonique validé.'
            },
            actorUserId,
            testAdminAuditContext
        );
        const created = targets.equipments.get(reviewed.matchedEquipmentId!);

        assert.equal(reviewed.status, 'accepted');
        assert.equal(created?.name, 'Presse-agrumes solaire');
        assert.equal(created?.normalizedName, 'presse agrumes solaire');
        assert.equal(created?.slug, 'presse-agrumes-solaire');
        assert.equal(audit.inputs.length, 1);
        assert.deepEqual(audit.inputs[0]?.afterValues?.createdEquipment, {
            id: 400,
            name: 'Presse-agrumes solaire',
            normalizedName: 'presse agrumes solaire',
            slug: 'presse-agrumes-solaire'
        });

        await assert.rejects(
            () => service.acceptEquipment(1, { reason: 'Mauvais type de proposition.' }, actorUserId, testAdminAuditContext),
            (error) => assertHttpError(error, 409, 'ADMIN_CATALOG_PROPOSALS_TYPE_MISMATCH')
        );
    });

    it('rejects either proposal type only with a valid reason and audit history', async () => {
        const reviewed = await service.reject(3, 'Suggestion hors périmètre.', actorUserId, testAdminAuditContext);

        assert.equal(reviewed.status, 'rejected');
        assert.equal(reviewed.matchedTagId, null);
        assert.equal(audit.inputs[0]?.eventType, 'catalog.proposals.reject');
        assert.equal(audit.inputs[0]?.reason, 'Suggestion hors périmètre.');

        await assert.rejects(() => service.reject(4, 'court', actorUserId, testAdminAuditContext), (error) => assertHttpError(error, 400, 'ADMIN_CATALOG_PROPOSALS_REJECT_REASON_TOO_SHORT'));
        assert.equal(audit.inputs.length, 1);
    });

    it('associates proposals only to active entities of the matching catalogue', async () => {
        const tagReview = await service.associateTag(
            1,
            {
                targetTagId: 10,
                reason: 'Correspond au tag déjà présent.'
            },
            actorUserId,
            testAdminAuditContext
        );
        const ingredientReview = await service.associateIngredient(
            2,
            {
                targetIngredientId: 20,
                reason: 'Correspond à cet ingrédient actif.'
            },
            actorUserId,
            testAdminAuditContext
        );
        const equipmentReview = await service.associateEquipment(
            6,
            {
                targetEquipmentId: 30,
                reason: 'Correspond à cet ustensile existant.'
            },
            actorUserId,
            testAdminAuditContext
        );

        assert.equal(tagReview.status, 'merged');
        assert.equal(tagReview.matchedTagId, 10);
        assert.equal(ingredientReview.matchedIngredientId, 20);
        assert.equal(equipmentReview.matchedEquipmentId, 30);
        assert.deepEqual(
            audit.inputs.map(({ eventType }) => eventType),
            ['catalog.proposals.associate', 'catalog.proposals.associate', 'catalog.proposals.associate']
        );

        await assert.rejects(
            () => service.associateTag(3, { targetTagId: 11, reason: 'Cible historique non active.' }, actorUserId, testAdminAuditContext),
            (error) => assertHttpError(error, 409, 'ADMIN_CATALOG_PROPOSALS_TARGET_TAG_NOT_ACTIVE')
        );
        await assert.rejects(
            () => service.associateTag(4, { targetTagId: 10, reason: 'Mauvais type de proposition.' }, actorUserId, testAdminAuditContext),
            (error) => assertHttpError(error, 409, 'ADMIN_CATALOG_PROPOSALS_TYPE_MISMATCH')
        );
        await assert.rejects(
            () =>
                service.associateEquipment(
                    5,
                    { targetEquipmentId: 999, reason: 'Ustensile cible introuvable.' },
                    actorUserId,
                    testAdminAuditContext
                ),
            (error) => assertHttpError(error, 404, 'ADMIN_CATALOG_PROPOSALS_TARGET_EQUIPMENT_NOT_FOUND')
        );
    });

    it('converts an ingredient proposal into an alias of an active target', async () => {
        const reviewed = await service.convertIngredientToAlias(
            4,
            {
                targetIngredientId: 20,
                languageCode: 'FR',
                reason: 'Variante française utile en alias.'
            },
            actorUserId,
            testAdminAuditContext
        );

        assert.equal(reviewed.status, 'merged');
        assert.equal(reviewed.matchedIngredientId, 20);
        assert.deepEqual(
            targets.aliases.map((alias) => ({
                ingredientId: alias.ingredientId,
                name: alias.name,
                normalizedName: alias.normalizedName,
                languageCode: alias.languageCode
            })),
            [
                {
                    ingredientId: 20,
                    name: 'Sucre lunaire',
                    normalizedName: 'sucre lunaire',
                    languageCode: 'fr'
                }
            ]
        );
        assert.equal(audit.inputs[0]?.eventType, 'catalog.proposals.alias');
    });

    it('rejects missing, reviewed, duplicate-name and concurrent decisions without audit', async () => {
        proposals.proposals.get(1)!.status = 'accepted';
        proposals.usedNames.add('ingredient:poudre de lune');

        await assert.rejects(() => service.reject(999, 'Proposition introuvable.', actorUserId, testAdminAuditContext), (error) => assertHttpError(error, 404, 'ADMIN_CATALOG_PROPOSALS_NOT_FOUND'));
        await assert.rejects(() => service.reject(1, 'Décision déjà enregistrée.', actorUserId, testAdminAuditContext), (error) => assertHttpError(error, 409, 'ADMIN_CATALOG_PROPOSALS_ALREADY_REVIEWED'));
        await assert.rejects(
            () => service.acceptIngredient(2, { reason: 'Collision apparue entre temps.' }, actorUserId, testAdminAuditContext),
            (error) => assertHttpError(error, 409, 'ADMIN_CATALOG_PROPOSALS_CANONICAL_NAME_TAKEN')
        );

        proposals.usedNames.add('equipment:presse agrumes solaire');
        await assert.rejects(
            () => service.acceptEquipment(5, { reason: 'Collision apparue entre temps.' }, actorUserId, testAdminAuditContext),
            (error) => assertHttpError(error, 409, 'ADMIN_CATALOG_PROPOSALS_CANONICAL_NAME_TAKEN')
        );

        proposals.usedNames.clear();
        proposals.reviewConflict = true;
        await assert.rejects(() => service.reject(3, 'Conflit concurrent de statut.', actorUserId, testAdminAuditContext), (error) => assertHttpError(error, 409, 'ADMIN_CATALOG_PROPOSALS_STATUS_CONFLICT'));
        assert.equal(audit.inputs.length, 0);
    });

    it('fails closed when alias creation conflicts or the audit recorder fails', async () => {
        targets.duplicateAlias = true;
        await assert.rejects(
            () =>
                service.convertIngredientToAlias(
                    4,
                    {
                        targetIngredientId: 20,
                        languageCode: 'fr',
                        reason: 'Alias déjà présent dans le catalogue.'
                    },
                    actorUserId,
                    testAdminAuditContext
                ),
            (error) => assertHttpError(error, 409, 'ADMIN_CATALOG_PROPOSALS_ALIAS_TAKEN')
        );
        assert.equal(audit.inputs.length, 0);

        targets.duplicateAlias = false;
        audit.error = new Error('audit unavailable');
        await assert.rejects(() => service.reject(3, 'Refus devant être audité.', actorUserId, testAdminAuditContext), /audit unavailable/);
    });

    it('defensively rejects malformed commands, missing groups and inactive or absent targets', async () => {
        const invalidCommands: Array<{ run: () => Promise<unknown>; status: number; code: string }> = [
            {
                run: () => service.list([] as never, pagination, actorUserId, testAdminAuditContext),
                status: 400,
                code: 'ADMIN_CATALOG_PROPOSALS_BAD_QUERY'
            },
            {
                run: () => service.acceptTag(1, null as never, actorUserId, testAdminAuditContext),
                status: 400,
                code: 'ADMIN_CATALOG_PROPOSALS_ACCEPT_BAD_BODY'
            },
            {
                run: () =>
                    service.acceptTag(
                        1,
                        { groupId: 8, slug: 'Bad Slug', reason: 'Motif suffisamment long.' },
                        actorUserId,
                        testAdminAuditContext
                    ),
                status: 400,
                code: 'ADMIN_CATALOG_PROPOSALS_TAG_SLUG_INVALID'
            },
            {
                run: () => service.acceptTag(1, { groupId: 999, reason: 'Groupe de tag introuvable.' }, actorUserId, testAdminAuditContext),
                status: 404,
                code: 'ADMIN_CATALOG_PROPOSALS_TAG_GROUP_NOT_FOUND'
            },
            {
                run: () =>
                    service.associateIngredient(
                        2,
                        { targetIngredientId: 999, reason: 'Cible ingrédient introuvable.' },
                        actorUserId,
                        testAdminAuditContext
                    ),
                status: 404,
                code: 'ADMIN_CATALOG_PROPOSALS_TARGET_INGREDIENT_NOT_FOUND'
            },
            {
                run: () => service.acceptEquipment(5, null as never, actorUserId, testAdminAuditContext),
                status: 400,
                code: 'ADMIN_CATALOG_PROPOSALS_ACCEPT_BAD_BODY'
            },
            {
                run: () =>
                    service.associateEquipment(6, { reason: 'Identifiant cible manquant.' } as never, actorUserId, testAdminAuditContext),
                status: 400,
                code: 'ADMIN_CATALOG_PROPOSALS_BAD_TARGET_EQUIPMENT_ID'
            },
            {
                run: () =>
                    service.convertIngredientToAlias(
                        4,
                        { targetIngredientId: 21, languageCode: 'fr', reason: 'Cible ingrédient non active.' },
                        actorUserId,
                        testAdminAuditContext
                    ),
                status: 409,
                code: 'ADMIN_CATALOG_PROPOSALS_TARGET_INGREDIENT_NOT_ACTIVE'
            },
            {
                run: () =>
                    service.convertIngredientToAlias(
                        4,
                        { targetIngredientId: 20, languageCode: 'fr_FR', reason: 'Code de langue non valide.' },
                        actorUserId,
                        testAdminAuditContext
                    ),
                status: 400,
                code: 'ADMIN_CATALOG_PROPOSALS_ALIAS_LANGUAGE_CODE_INVALID'
            }
        ];

        for (const { run, status, code } of invalidCommands)
            await assert.rejects(run, (error) => assertHttpError(error, status, code));
        assert.equal(audit.inputs.length, 0);
    });
});

function createProposal(id: number, proposalType: CatalogProposalType, proposedName: string, normalizedName: string): CatalogProposal {
    return {
        id,
        authorUserId: 7,
        recipeId: 42,
        proposalType,
        proposedName,
        normalizedName,
        status: 'pending',
        matchedTagId: null,
        matchedIngredientId: null,
        matchedEquipmentId: null,
        reviewedByStaffUserId: null,
        reviewReason: null,
        createdAt,
        reviewedAt: null
    };
}

function createTag(id: number, name: string, normalizedName: string, slug: string, status: Tag['status'] = 'active'): Tag {
    return {
        id,
        name,
        normalizedName,
        slug,
        description: null,
        status,
        mergedIntoTagId: null,
        createdAt,
        updatedAt: createdAt,
        group: { id: 8, name: 'Cuisine', slug: 'cuisine', sortOrder: 8 }
    };
}

function createIngredient(id: number, name: string, normalizedName: string, slug: string, status: Ingredient['status'] = 'active'): Ingredient {
    return {
        id,
        name,
        normalizedName,
        slug,
        status,
        mergedIntoIngredientId: null,
        createdAt,
        updatedAt: createdAt
    };
}

function createEquipment(id: number, name: string, normalizedName: string, slug: string): Equipment {
    return { id, name, normalizedName, slug };
}

function cloneProposal(proposal: CatalogProposal): CatalogProposal {
    return { ...proposal };
}

function cloneTag(tag: Tag): Tag {
    return { ...tag, group: { ...tag.group } };
}

function cloneIngredient(ingredient: Ingredient): Ingredient {
    return { ...ingredient };
}

function cloneEquipment(equipment: Equipment): Equipment {
    return { ...equipment };
}

function assertHttpError(error: unknown, status: number, code: string): boolean {
    assert.ok(error instanceof HttpError);
    assert.equal(error.statusCode, status);
    assert.equal(error.code, code);
    return true;
}
