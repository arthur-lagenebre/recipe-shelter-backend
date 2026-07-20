import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { AdminIngredientService } from '../../../src/services/admin/admin.ingredients.service.js';
import { HttpError } from '../../../src/utils/errors.js';
import { createPaginatedResult } from '../../../src/utils/pagination.js';
import { testAdminAuditContext, TestAdminAuditRecorder } from '../../helpers/admin-audit.js';

import type { AdminIngredientRepository } from '../../../src/repositories/admin/admin.ingredients.repository.interface.js';
import type {
  AdminIngredientAliasListFilters,
  AdminIngredientAliasUpdateInput,
  AdminIngredientAliasWriteInput,
  AdminIngredientListFilters,
  AdminIngredientMergeResult,
  AdminIngredientUpdateInput,
  AdminIngredientWriteInput
} from '../../../src/repositories/admin/admin.ingredients.types.js';
import type { Ingredient, IngredientAlias } from '../../../src/repositories/ingredients/ingredient.types.js';
import type { PaginationOptions } from '../../../src/utils/pagination.js';

const actorUserId = 17;
const pagination = { page: 2, limit: 2, offset: 2 };

class FakeAdminIngredientRepository implements AdminIngredientRepository {
  ingredients = new Map<number, Ingredient>([
    [1, createIngredient(1, 'Tomate', 'tomate', 'tomate')],
    [2, createIngredient(2, 'Tomate cerise', 'tomate cerise', 'tomate-cerise')],
    [3, createIngredient(3, 'Ancienne tomate', 'ancienne tomate', 'ancienne-tomate', 'deprecated')],
    [4, createIngredient(4, 'Tomate fusionnée', 'tomate fusionnee', 'tomate-fusionnee', 'merged', 1)]
  ]);
  aliases = new Map<number, IngredientAlias>([
    [10, createAlias(10, 1, 'Tomato', 'tomato', 'en')],
    [11, createAlias(11, 2, 'Cherry tomato', 'cherry tomato', 'en')]
  ]);
  mergeResult: AdminIngredientMergeResult = {
    merged: true,
    sourceRecipeAssociationCountBefore: 3,
    targetRecipeAssociationCountBefore: 2,
    targetRecipeAssociationCountAfter: 5,
    transferredRecipeAssociationCount: 3,
    sourceAliasCountBefore: 1,
    targetAliasCountBefore: 1,
    targetAliasCountAfter: 2,
    transferredAliasCount: 1,
    redirectedMergedIngredientCount: 1
  };
  createStatus: 'normalized_name_taken' | 'slug_taken' | null = null;
  aliasTaken = false;
  mergedSourceTargets = new Set<number>([1]);

  async find(filters: AdminIngredientListFilters, page: PaginationOptions): Promise<ReturnType<typeof createPaginatedResult<Ingredient>>> {
    const matches = [...this.ingredients.values()].filter((ingredient) =>
      (filters.status === undefined || ingredient.status === filters.status)
      && (filters.q === undefined || ingredient.name.toLowerCase().includes(filters.q.toLowerCase()))
    );

    return createPaginatedResult(matches.slice(page.offset, page.offset + page.limit).map(cloneIngredient), matches.length, page);
  }

  async findById(ingredientId: number): Promise<Ingredient | null> {
    const ingredient = this.ingredients.get(ingredientId);
    return ingredient ? cloneIngredient(ingredient) : null;
  }

  async findByIdsForUpdate(ids: number[]): Promise<Ingredient[]> {
    return ids.flatMap((id) => {
      const ingredient = this.ingredients.get(id);
      return ingredient ? [cloneIngredient(ingredient)] : [];
    });
  }

  async create(input: AdminIngredientWriteInput) {
    if (this.createStatus)
      return { status: this.createStatus } as const;

    const id = Math.max(...this.ingredients.keys()) + 1;
    const ingredient = createIngredient(id, input.name, input.normalizedName, input.slug);
    this.ingredients.set(id, ingredient);
    return { status: 'written' as const, ingredient: cloneIngredient(ingredient) };
  }

  async update(input: AdminIngredientUpdateInput) {
    if (this.createStatus)
      return { status: this.createStatus } as const;

    const current = this.ingredients.get(input.id)!;
    const ingredient = { ...current, ...input, updatedAt: new Date('2026-07-21T10:00:00.000Z') };
    this.ingredients.set(input.id, ingredient);
    return { status: 'written' as const, ingredient: cloneIngredient(ingredient) };
  }

  async hasAliases(ingredientId: number): Promise<boolean> {
    return [...this.aliases.values()].some((alias) => alias.ingredientId === ingredientId);
  }

  async hasMergedSources(ingredientId: number): Promise<boolean> {
    return this.mergedSourceTargets.has(ingredientId);
  }

  async deprecate(ingredientId: number): Promise<boolean> {
    const ingredient = this.ingredients.get(ingredientId);
    if (!ingredient || ingredient.status !== 'active')
      return false;

    ingredient.status = 'deprecated';
    ingredient.updatedAt = new Date('2026-07-21T10:00:00.000Z');
    return true;
  }

  async restore(ingredientId: number) {
    const ingredient = this.ingredients.get(ingredientId);
    if (!ingredient || ingredient.status !== 'deprecated')
      return 'not_updated' as const;
    if (this.createStatus === 'normalized_name_taken')
      return 'normalized_name_taken' as const;

    ingredient.status = 'active';
    ingredient.updatedAt = new Date('2026-07-21T10:00:00.000Z');
    return 'restored' as const;
  }

  async merge(sourceIngredientId: number, targetIngredientId: number): Promise<AdminIngredientMergeResult> {
    if (!this.mergeResult.merged)
      return { ...this.mergeResult };

    const source = this.ingredients.get(sourceIngredientId)!;
    source.status = 'merged';
    source.mergedIntoIngredientId = targetIngredientId;
    source.updatedAt = new Date('2026-07-21T10:00:00.000Z');
    for (const ingredient of this.ingredients.values()) {
      if (ingredient.mergedIntoIngredientId === sourceIngredientId)
        ingredient.mergedIntoIngredientId = targetIngredientId;
    }
    for (const alias of this.aliases.values()) {
      if (alias.ingredientId === sourceIngredientId)
        alias.ingredientId = targetIngredientId;
    }

    return { ...this.mergeResult };
  }

  async findAliases(
    ingredientId: number,
    filters: AdminIngredientAliasListFilters,
    page: PaginationOptions
  ) {
    const matches = [...this.aliases.values()].filter((alias) =>
      alias.ingredientId === ingredientId
      && (filters.languageCode === undefined || alias.languageCode === filters.languageCode)
      && (filters.q === undefined || alias.name.toLowerCase().includes(filters.q.toLowerCase()))
    );

    return createPaginatedResult(matches.slice(page.offset, page.offset + page.limit).map(cloneAlias), matches.length, page);
  }

  async findAliasForUpdate(ingredientId: number, aliasId: number): Promise<IngredientAlias | null> {
    const alias = this.aliases.get(aliasId);
    return alias?.ingredientId === ingredientId ? cloneAlias(alias) : null;
  }

  async createAlias(input: AdminIngredientAliasWriteInput) {
    if (this.aliasTaken)
      return { status: 'alias_taken' as const };

    const id = Math.max(...this.aliases.keys()) + 1;
    const alias = createAlias(id, input.ingredientId, input.name, input.normalizedName, input.languageCode);
    this.aliases.set(id, alias);
    return { status: 'written' as const, alias: cloneAlias(alias) };
  }

  async updateAlias(input: AdminIngredientAliasUpdateInput) {
    if (this.aliasTaken)
      return { status: 'alias_taken' as const };

    const current = this.aliases.get(input.id)!;
    const alias = { ...current, ...input, updatedAt: new Date('2026-07-21T10:00:00.000Z') };
    this.aliases.set(input.id, alias);
    return { status: 'written' as const, alias: cloneAlias(alias) };
  }

  async deleteAlias(ingredientId: number, aliasId: number): Promise<boolean> {
    const alias = this.aliases.get(aliasId);
    return alias?.ingredientId === ingredientId ? this.aliases.delete(aliasId) : false;
  }
}

describe('AdminIngredientService', () => {
  let repository: FakeAdminIngredientRepository;
  let audit: TestAdminAuditRecorder;
  let service: AdminIngredientService;

  beforeEach(() => {
    repository = new FakeAdminIngredientRepository();
    audit = new TestAdminAuditRecorder();
    service = new AdminIngredientService(repository, audit);
  });

  it('lists a filtered, paginated catalog and audits the query', async () => {
    const result = await service.list({ status: 'active', q: 'tomate' }, pagination, actorUserId, testAdminAuditContext);

    assert.deepEqual(result.pagination, {
      page: 2,
      limit: 2,
      totalItems: 2,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: true
    });
    assert.deepEqual(result.items, []);
    assert.deepEqual({
      eventType: audit.inputs[0]?.eventType,
      targetType: audit.inputs[0]?.targetType,
      afterValues: audit.inputs[0]?.afterValues
    }, {
      eventType: 'ingredients.list',
      targetType: 'ingredient_collection',
      afterValues: {
        resultCount: 0,
        totalItems: 2,
        page: 2,
        limit: 2,
        filters: { status: 'active', q: 'tomate' }
      }
    });
  });

  it('creates and updates active canonical ingredients with normalized names and audit snapshots', async () => {
    const created = await service.create({ name: 'Crème fraîche' }, actorUserId, testAdminAuditContext);
    assert.equal(created.normalizedName, 'creme fraiche');
    assert.equal(created.slug, 'creme-fraiche');

    const updated = await service.update(created.id, {
      name: 'Crème épaisse',
      slug: 'creme-epaisse'
    }, actorUserId, testAdminAuditContext);
    assert.deepEqual({ name: updated.name, normalizedName: updated.normalizedName, slug: updated.slug }, {
      name: 'Crème épaisse',
      normalizedName: 'creme epaisse',
      slug: 'creme-epaisse'
    });
    assert.deepEqual(audit.inputs.map(({ eventType }) => eventType), ['ingredients.create', 'ingredients.update']);
    assert.equal(audit.inputs[1]?.beforeValues?.name, 'Crème fraîche');
    assert.equal(audit.inputs[1]?.afterValues?.name, 'Crème épaisse');
  });

  it('rejects canonical conflicts, invalid status updates and missing ingredients without audit', async () => {
    repository.createStatus = 'normalized_name_taken';
    await assert.rejects(
      () => service.create({ name: 'TOMATE' }, actorUserId, testAdminAuditContext),
      matchesHttpError(409, 'ADMIN_INGREDIENTS_NORMALIZED_NAME_TAKEN')
    );
    repository.createStatus = 'slug_taken';
    await assert.rejects(
      () => service.update(1, { slug: 'tomate-cerise' }, actorUserId, testAdminAuditContext),
      matchesHttpError(409, 'ADMIN_INGREDIENTS_SLUG_TAKEN')
    );
    await assert.rejects(
      () => service.update(3, { name: 'Interdit' }, actorUserId, testAdminAuditContext),
      matchesHttpError(409, 'ADMIN_INGREDIENTS_UPDATE_INVALID_STATUS')
    );
    await assert.rejects(
      () => service.update(999, { name: 'Absent' }, actorUserId, testAdminAuditContext),
      matchesHttpError(404, 'ADMIN_INGREDIENTS_NOT_FOUND')
    );
    assert.equal(audit.inputs.length, 0);
  });

  it('deprecates and restores an unused ingredient with reasons in distinct audit events', async () => {
    repository.mergedSourceTargets.clear();
    repository.aliases.delete(11);
    const deprecated = await service.deprecate(2, 'Référence devenue obsolète.', actorUserId, testAdminAuditContext);
    assert.equal(deprecated.status, 'deprecated');

    const restored = await service.restore(2, 'Référence remise au catalogue.', actorUserId, testAdminAuditContext);
    assert.equal(restored.status, 'active');
    assert.deepEqual(audit.inputs.map(({ eventType, reason }) => ({ eventType, reason })), [
      { eventType: 'ingredients.deprecate', reason: 'Référence devenue obsolète.' },
      { eventType: 'ingredients.restore', reason: 'Référence remise au catalogue.' }
    ]);
  });

  it('blocks deprecation of canonical targets and ingredients carrying aliases', async () => {
    await assert.rejects(
      () => service.deprecate(1, 'Cible canonique encore utilisée.', actorUserId, testAdminAuditContext),
      matchesHttpError(409, 'ADMIN_INGREDIENTS_DEPRECATE_CANONICAL_TARGET')
    );
    repository.mergedSourceTargets.clear();
    await assert.rejects(
      () => service.deprecate(2, 'Alias encore rattaché à retirer.', actorUserId, testAdminAuditContext),
      matchesHttpError(409, 'ADMIN_INGREDIENTS_DEPRECATE_HAS_ALIASES')
    );
    assert.equal(audit.inputs.length, 0);
  });

  it('merges into an active target and audits recipe-label preservation, aliases and redirects', async () => {
    repository.ingredients.get(4)!.mergedIntoIngredientId = 2;
    const merged = await service.merge(2, {
      targetIngredientId: 1,
      reason: 'Doublon de la tomate canonique.'
    }, actorUserId, testAdminAuditContext);

    assert.equal(merged.status, 'merged');
    assert.equal(merged.mergedIntoIngredientId, 1);
    assert.equal(repository.aliases.get(11)?.ingredientId, 1);
    assert.equal(repository.ingredients.get(4)?.mergedIntoIngredientId, 1);
    assert.deepEqual(audit.inputs[0]?.afterValues?.recipeAssociations, {
      sourceCount: 0,
      targetCount: 5,
      transferredCount: 3,
      authorDisplayTextPreserved: true
    });
    assert.deepEqual(audit.inputs[0]?.afterValues?.aliases, {
      sourceCount: 0,
      targetCount: 2,
      transferredCount: 1
    });
  });

  it('rejects self-merges and invalid source or target states without audit', async () => {
    await assert.rejects(
      () => service.merge(1, { targetIngredientId: 1, reason: 'Fusion impossible sur soi.' }, actorUserId, testAdminAuditContext),
      matchesHttpError(400, 'ADMIN_INGREDIENTS_MERGE_SELF')
    );
    await assert.rejects(
      () => service.merge(4, { targetIngredientId: 1, reason: 'Source déjà fusionnée.' }, actorUserId, testAdminAuditContext),
      matchesHttpError(409, 'ADMIN_INGREDIENTS_MERGE_INVALID_SOURCE_STATUS')
    );
    await assert.rejects(
      () => service.merge(1, { targetIngredientId: 3, reason: 'Cible dépréciée interdite.' }, actorUserId, testAdminAuditContext),
      matchesHttpError(409, 'ADMIN_INGREDIENTS_MERGE_INVALID_TARGET_STATUS')
    );
    assert.equal(audit.inputs.length, 0);
  });

  it('lists, creates, updates and deletes aliases with one audit event per action', async () => {
    const listed = await service.listAliases(1, { languageCode: 'en' }, {
      page: 1,
      limit: 25,
      offset: 0
    }, actorUserId, testAdminAuditContext);
    assert.deepEqual(listed.items.map(({ name }) => name), ['Tomato']);

    const created = await service.createAlias(1, {
      name: 'Tomate commune',
      languageCode: 'FR'
    }, actorUserId, testAdminAuditContext);
    assert.equal(created.normalizedName, 'tomate commune');
    assert.equal(created.languageCode, 'fr');

    const updated = await service.updateAlias(1, created.id, {
      name: 'Tomate de table'
    }, actorUserId, testAdminAuditContext);
    assert.equal(updated.normalizedName, 'tomate de table');
    await service.deleteAlias(1, created.id, actorUserId, testAdminAuditContext);
    assert.equal(repository.aliases.has(created.id), false);

    assert.deepEqual(audit.inputs.map(({ eventType }) => eventType), [
      'ingredients.aliases.list',
      'ingredients.aliases.create',
      'ingredients.aliases.update',
      'ingredients.aliases.delete'
    ]);
  });

  it('rejects duplicate aliases, non-active targets and alias ownership mismatches without audit', async () => {
    repository.aliasTaken = true;
    await assert.rejects(
      () => service.createAlias(1, { name: 'Tomato', languageCode: 'en' }, actorUserId, testAdminAuditContext),
      matchesHttpError(409, 'ADMIN_INGREDIENT_ALIASES_TAKEN')
    );
    await assert.rejects(
      () => service.createAlias(3, { name: 'Ancien', languageCode: 'fr' }, actorUserId, testAdminAuditContext),
      matchesHttpError(409, 'ADMIN_INGREDIENT_ALIASES_INVALID_INGREDIENT_STATUS')
    );
    repository.aliasTaken = false;
    await assert.rejects(
      () => service.updateAlias(1, 11, { name: 'Mauvais parent' }, actorUserId, testAdminAuditContext),
      matchesHttpError(404, 'ADMIN_INGREDIENT_ALIASES_NOT_FOUND')
    );
    assert.equal(audit.inputs.length, 0);
  });
});

function createIngredient(
  id: number,
  name: string,
  normalizedName: string,
  slug: string,
  status: Ingredient['status'] = 'active',
  mergedIntoIngredientId: number | null = null
): Ingredient {
  return {
    id,
    name,
    normalizedName,
    slug,
    status,
    mergedIntoIngredientId,
    createdAt: new Date('2026-07-20T10:00:00.000Z'),
    updatedAt: new Date('2026-07-20T10:00:00.000Z')
  };
}

function createAlias(
  id: number,
  ingredientId: number,
  name: string,
  normalizedName: string,
  languageCode: string
): IngredientAlias {
  return {
    id,
    ingredientId,
    name,
    normalizedName,
    languageCode,
    createdAt: new Date('2026-07-20T10:00:00.000Z'),
    updatedAt: new Date('2026-07-20T10:00:00.000Z')
  };
}

function cloneIngredient(ingredient: Ingredient): Ingredient {
  return { ...ingredient, createdAt: new Date(ingredient.createdAt), updatedAt: new Date(ingredient.updatedAt) };
}

function cloneAlias(alias: IngredientAlias): IngredientAlias {
  return { ...alias, createdAt: new Date(alias.createdAt), updatedAt: new Date(alias.updatedAt) };
}

function matchesHttpError(statusCode: number, code: string) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.code, code);
    return true;
  };
}
