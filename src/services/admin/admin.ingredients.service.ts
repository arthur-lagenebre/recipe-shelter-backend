import { ADMIN_AUDIT_EVENT_TYPES, ADMIN_AUDIT_TARGET_TYPES } from './admin.audit.events.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { normalizeIngredientName } from '../ingredients/ingredients.service.js';

import type { AdminAuditActionRunner } from './admin.audit-action.runner.js';
import type { AdminAuditRequestContext } from './admin.audit.service.js';
import type { AdminIngredientRepository } from '../../repositories/admin/admin.ingredients.repository.interface.js';
import type { AdminIngredientAliasListFilters, AdminIngredientAliasWriteResult, AdminIngredientListFilters, AdminIngredientWriteResult } from '../../repositories/admin/admin.ingredients.types.js';
import type { Ingredient, IngredientAlias } from '../../repositories/ingredients/ingredient.types.js';
import type { PaginatedResult, PaginationOptions } from '../../utils/pagination.js';

const INGREDIENT_NAME_MAX_LENGTH = 255;
const INGREDIENT_SLUG_MAX_LENGTH = 255;
const LANGUAGE_CODE_MAX_LENGTH = 35;
const ACTION_REASON_MIN_LENGTH = 10;
const ACTION_REASON_MAX_LENGTH = 1000;
const INGREDIENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LANGUAGE_CODE_PATTERN = /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/;
const CANONICAL_INGREDIENT_LANGUAGE_CODE = 'fr';

export type AdminCreateIngredientCommand = {
  name: string;
  slug?: string;
};

export type AdminUpdateIngredientCommand = {
  name?: string;
  slug?: string;
};

export type AdminMergeIngredientCommand = {
  targetIngredientId: number;
  reason: string;
};

export type AdminCreateIngredientAliasCommand = {
  name: string;
  languageCode: string;
};

export type AdminUpdateIngredientAliasCommand = {
  name?: string;
  languageCode?: string;
};

export class AdminIngredientService {
  constructor(
    private readonly ingredients: AdminIngredientRepository,
    private readonly auditActions: AdminAuditActionRunner
  ) { }

  async list(
    filters: AdminIngredientListFilters,
    pagination: PaginationOptions,
    actorUserId: number,
    context: AdminAuditRequestContext
  ): Promise<PaginatedResult<Ingredient>> {
    return this.auditActions.run(async ({ db, audit }) => {
      const result = await this.ingredients.find(filters, pagination, db);

      await audit.record({
        actorUserId,
        eventType: ADMIN_AUDIT_EVENT_TYPES.ingredientsList,
        targetType: ADMIN_AUDIT_TARGET_TYPES.ingredientCollection,
        targetId: 'all',
        afterValues: {
          resultCount: result.items.length,
          totalItems: result.pagination.totalItems,
          page: result.pagination.page,
          limit: result.pagination.limit,
          filters: snapshotIngredientFilters(filters)
        },
        ...context
      });

      return result;
    });
  }

  async create(
    input: AdminCreateIngredientCommand,
    actorUserId: number,
    context: AdminAuditRequestContext
  ): Promise<Ingredient> {
    const command = validateCreateIngredientCommand(input);

    return this.auditActions.run(async ({ db, audit }) => {
      const ingredient = requireWrittenIngredient(await this.ingredients.create(command, db));

      await audit.record({
        actorUserId,
        eventType: ADMIN_AUDIT_EVENT_TYPES.ingredientsCreate,
        targetType: ADMIN_AUDIT_TARGET_TYPES.ingredient,
        targetId: ingredient.id,
        afterValues: snapshotIngredient(ingredient),
        ...context
      });

      return ingredient;
    });
  }

  async update(
    ingredientId: number,
    input: AdminUpdateIngredientCommand,
    actorUserId: number,
    context: AdminAuditRequestContext
  ): Promise<Ingredient> {
    requirePositiveId(ingredientId, 'Ingredient id', 'ADMIN_INGREDIENTS_BAD_ID');
    const command = validateUpdateIngredientCommand(input);

    return this.auditActions.run(async ({ db, audit }) => {
      const before = await this.requireIngredientForUpdate(ingredientId, db);
      if (before.status !== 'active')
        throw conflict('Only an active ingredient can be modified', 'ADMIN_INGREDIENTS_UPDATE_INVALID_STATUS');

      const name = command.name ?? before.name;
      const normalizedName = command.name === undefined ? before.normalizedName : normalizeAndValidateName(name);
      const ingredient = requireWrittenIngredient(await this.ingredients.update({
        id: ingredientId,
        name,
        normalizedName,
        slug: command.slug ?? before.slug
      }, db));

      await audit.record({
        actorUserId,
        eventType: ADMIN_AUDIT_EVENT_TYPES.ingredientsUpdate,
        targetType: ADMIN_AUDIT_TARGET_TYPES.ingredient,
        targetId: ingredient.id,
        beforeValues: snapshotIngredient(before),
        afterValues: snapshotIngredient(ingredient),
        ...context
      });

      return ingredient;
    });
  }

  async deprecate(
    ingredientId: number,
    reason: string,
    actorUserId: number,
    context: AdminAuditRequestContext
  ): Promise<Ingredient> {
    requirePositiveId(ingredientId, 'Ingredient id', 'ADMIN_INGREDIENTS_BAD_ID');
    const cleanReason = validateActionReason(reason, 'deprecate');

    return this.auditActions.run(async ({ db, audit }) => {
      const before = await this.requireIngredientForUpdate(ingredientId, db);
      if (before.status !== 'active')
        throw conflict('Only an active ingredient can be deprecated', 'ADMIN_INGREDIENTS_DEPRECATE_INVALID_STATUS');
      if (await this.ingredients.hasMergedSources(ingredientId, db))
        throw conflict('A canonical merge target cannot be deprecated', 'ADMIN_INGREDIENTS_DEPRECATE_CANONICAL_TARGET');
      if (await this.ingredients.hasAliases(ingredientId, db))
        throw conflict('Remove ingredient aliases before deprecation', 'ADMIN_INGREDIENTS_DEPRECATE_HAS_ALIASES');
      if (!await this.ingredients.deprecate(ingredientId, db))
        throw conflict('Ingredient status changed concurrently', 'ADMIN_INGREDIENTS_STATUS_CONFLICT');

      const after = await this.requireIngredientForUpdate(ingredientId, db);
      await audit.record({
        actorUserId,
        eventType: ADMIN_AUDIT_EVENT_TYPES.ingredientsDeprecate,
        targetType: ADMIN_AUDIT_TARGET_TYPES.ingredient,
        targetId: ingredientId,
        reason: cleanReason,
        beforeValues: snapshotIngredient(before),
        afterValues: snapshotIngredient(after),
        ...context
      });

      return after;
    });
  }

  async restore(
    ingredientId: number,
    reason: string,
    actorUserId: number,
    context: AdminAuditRequestContext
  ): Promise<Ingredient> {
    requirePositiveId(ingredientId, 'Ingredient id', 'ADMIN_INGREDIENTS_BAD_ID');
    const cleanReason = validateActionReason(reason, 'restore');

    return this.auditActions.run(async ({ db, audit }) => {
      const before = await this.requireIngredientForUpdate(ingredientId, db);
      if (before.status !== 'deprecated')
        throw conflict('Only a deprecated ingredient can be restored', 'ADMIN_INGREDIENTS_RESTORE_INVALID_STATUS');

      const result = await this.ingredients.restore(ingredientId, db);
      if (result === 'normalized_name_taken')
        throw conflict('An active ingredient already uses this canonical name', 'ADMIN_INGREDIENTS_NORMALIZED_NAME_TAKEN');
      if (result !== 'restored')
        throw conflict('Ingredient status changed concurrently', 'ADMIN_INGREDIENTS_STATUS_CONFLICT');

      const after = await this.requireIngredientForUpdate(ingredientId, db);
      await audit.record({
        actorUserId,
        eventType: ADMIN_AUDIT_EVENT_TYPES.ingredientsRestore,
        targetType: ADMIN_AUDIT_TARGET_TYPES.ingredient,
        targetId: ingredientId,
        reason: cleanReason,
        beforeValues: snapshotIngredient(before),
        afterValues: snapshotIngredient(after),
        ...context
      });

      return after;
    });
  }

  async merge(
    sourceIngredientId: number,
    input: AdminMergeIngredientCommand,
    actorUserId: number,
    context: AdminAuditRequestContext
  ): Promise<Ingredient> {
    requirePositiveId(sourceIngredientId, 'Ingredient id', 'ADMIN_INGREDIENTS_BAD_ID');
    if (!input || typeof input !== 'object')
      throw badRequest('Invalid ingredient merge', 'ADMIN_INGREDIENTS_MERGE_BAD_BODY');
    requirePositiveId(input.targetIngredientId, 'Merge target ingredient id', 'ADMIN_INGREDIENTS_MERGE_BAD_TARGET_ID');
    const cleanReason = validateActionReason(input.reason, 'merge');
    if (sourceIngredientId === input.targetIngredientId)
      throw badRequest('An ingredient cannot be merged into itself', 'ADMIN_INGREDIENTS_MERGE_SELF');

    return this.auditActions.run(async ({ db, audit }) => {
      const lockedIngredients = await this.ingredients.findByIdsForUpdate(
        [sourceIngredientId, input.targetIngredientId].sort((left, right) => left - right),
        db
      );
      const source = lockedIngredients.find(({ id }) => id === sourceIngredientId);
      const target = lockedIngredients.find(({ id }) => id === input.targetIngredientId);

      if (!source)
        throw notFound('Ingredient not found', 'ADMIN_INGREDIENTS_NOT_FOUND');
      if (!target)
        throw notFound('Merge target ingredient not found', 'ADMIN_INGREDIENTS_MERGE_TARGET_NOT_FOUND');
      if (source.status === 'merged')
        throw conflict('A merged ingredient cannot be merged again', 'ADMIN_INGREDIENTS_MERGE_INVALID_SOURCE_STATUS');
      if (target.status !== 'active')
        throw conflict('A merge target must be active', 'ADMIN_INGREDIENTS_MERGE_INVALID_TARGET_STATUS');

      const result = await this.ingredients.merge({
        sourceIngredientId,
        targetIngredientId: target.id,
        sourceName: source.name,
        sourceNormalizedName: source.normalizedName,
        sourceNameLanguageCode: CANONICAL_INGREDIENT_LANGUAGE_CODE
      }, db);
      if (result.status === 'source_name_alias_conflict')
        throw conflict(
          'The source canonical name is already an alias of another ingredient',
          'ADMIN_INGREDIENTS_MERGE_SOURCE_NAME_ALIAS_CONFLICT'
        );
      if (result.status === 'not_merged')
        throw conflict('Ingredient status changed concurrently', 'ADMIN_INGREDIENTS_STATUS_CONFLICT');

      const after = await this.requireIngredientForUpdate(sourceIngredientId, db);
      await audit.record({
        actorUserId,
        eventType: ADMIN_AUDIT_EVENT_TYPES.ingredientsMerge,
        targetType: ADMIN_AUDIT_TARGET_TYPES.ingredient,
        targetId: sourceIngredientId,
        reason: cleanReason,
        beforeValues: {
          source: snapshotIngredient(source),
          target: snapshotIngredient(target),
          recipeAssociations: {
            sourceCount: result.sourceRecipeAssociationCountBefore,
            targetCount: result.targetRecipeAssociationCountBefore
          },
          aliases: {
            sourceCount: result.sourceAliasCountBefore,
            targetCount: result.targetAliasCountBefore
          },
          mergedIngredientsPointingToSourceCount: result.redirectedMergedIngredientCount
        },
        afterValues: {
          source: snapshotIngredient(after),
          target: snapshotIngredient(target),
          recipeAssociations: {
            sourceCount: 0,
            targetCount: result.targetRecipeAssociationCountAfter,
            transferredCount: result.transferredRecipeAssociationCount,
            authorDisplayTextPreserved: true
          },
          aliases: {
            sourceCount: 0,
            targetCount: result.targetAliasCountAfter,
            transferredCount: result.transferredAliasCount,
            sourceNameAlias: {
              name: source.name,
              normalizedName: source.normalizedName,
              languageCode: CANONICAL_INGREDIENT_LANGUAGE_CODE,
              resolution: result.sourceNameAliasResolution
            }
          },
          mergedIngredientsPointingToSourceCount: 0,
          redirectedMergedIngredientCount: result.redirectedMergedIngredientCount
        },
        ...context
      });

      return after;
    });
  }

  async listAliases(
    ingredientId: number,
    filters: AdminIngredientAliasListFilters,
    pagination: PaginationOptions,
    actorUserId: number,
    context: AdminAuditRequestContext
  ): Promise<PaginatedResult<IngredientAlias>> {
    requirePositiveId(ingredientId, 'Ingredient id', 'ADMIN_INGREDIENTS_BAD_ID');

    return this.auditActions.run(async ({ db, audit }) => {
      await this.requireIngredient(ingredientId, db);
      const result = await this.ingredients.findAliases(ingredientId, filters, pagination, db);

      await audit.record({
        actorUserId,
        eventType: ADMIN_AUDIT_EVENT_TYPES.ingredientAliasesList,
        targetType: ADMIN_AUDIT_TARGET_TYPES.ingredient,
        targetId: ingredientId,
        afterValues: {
          resultCount: result.items.length,
          totalItems: result.pagination.totalItems,
          page: result.pagination.page,
          limit: result.pagination.limit,
          filters: snapshotAliasFilters(filters)
        },
        ...context
      });

      return result;
    });
  }

  async createAlias(
    ingredientId: number,
    input: AdminCreateIngredientAliasCommand,
    actorUserId: number,
    context: AdminAuditRequestContext
  ): Promise<IngredientAlias> {
    requirePositiveId(ingredientId, 'Ingredient id', 'ADMIN_INGREDIENTS_BAD_ID');
    const command = validateCreateAliasCommand(input);

    return this.auditActions.run(async ({ db, audit }) => {
      const ingredient = await this.requireIngredientForUpdate(ingredientId, db);
      requireActiveAliasTarget(ingredient);
      const alias = requireWrittenAlias(await this.ingredients.createAlias({ ingredientId, ...command }, db));

      await audit.record({
        actorUserId,
        eventType: ADMIN_AUDIT_EVENT_TYPES.ingredientAliasesCreate,
        targetType: ADMIN_AUDIT_TARGET_TYPES.ingredientAlias,
        targetId: alias.id,
        afterValues: snapshotAlias(alias),
        ...context
      });

      return alias;
    });
  }

  async updateAlias(
    ingredientId: number,
    aliasId: number,
    input: AdminUpdateIngredientAliasCommand,
    actorUserId: number,
    context: AdminAuditRequestContext
  ): Promise<IngredientAlias> {
    requirePositiveId(ingredientId, 'Ingredient id', 'ADMIN_INGREDIENTS_BAD_ID');
    requirePositiveId(aliasId, 'Ingredient alias id', 'ADMIN_INGREDIENT_ALIASES_BAD_ID');
    const command = validateUpdateAliasCommand(input);

    return this.auditActions.run(async ({ db, audit }) => {
      const ingredient = await this.requireIngredientForUpdate(ingredientId, db);
      requireActiveAliasTarget(ingredient);
      const before = await this.requireAliasForUpdate(ingredientId, aliasId, db);
      await this.rejectMergeSourceNameAliasChange(ingredientId, aliasId, db);
      const name = command.name ?? before.name;
      const alias = requireWrittenAlias(await this.ingredients.updateAlias({
        id: aliasId,
        ingredientId,
        name,
        normalizedName: command.name === undefined ? before.normalizedName : normalizeAndValidateAliasName(name),
        languageCode: command.languageCode ?? before.languageCode
      }, db));

      await audit.record({
        actorUserId,
        eventType: ADMIN_AUDIT_EVENT_TYPES.ingredientAliasesUpdate,
        targetType: ADMIN_AUDIT_TARGET_TYPES.ingredientAlias,
        targetId: alias.id,
        beforeValues: snapshotAlias(before),
        afterValues: snapshotAlias(alias),
        ...context
      });

      return alias;
    });
  }

  async deleteAlias(
    ingredientId: number,
    aliasId: number,
    actorUserId: number,
    context: AdminAuditRequestContext
  ): Promise<void> {
    requirePositiveId(ingredientId, 'Ingredient id', 'ADMIN_INGREDIENTS_BAD_ID');
    requirePositiveId(aliasId, 'Ingredient alias id', 'ADMIN_INGREDIENT_ALIASES_BAD_ID');

    return this.auditActions.run(async ({ db, audit }) => {
      const ingredient = await this.requireIngredientForUpdate(ingredientId, db);
      requireActiveAliasTarget(ingredient);
      const before = await this.requireAliasForUpdate(ingredientId, aliasId, db);
      await this.rejectMergeSourceNameAliasChange(ingredientId, aliasId, db);
      if (!await this.ingredients.deleteAlias(ingredientId, aliasId, db))
        throw conflict('Ingredient alias changed concurrently', 'ADMIN_INGREDIENT_ALIASES_CONFLICT');

      await audit.record({
        actorUserId,
        eventType: ADMIN_AUDIT_EVENT_TYPES.ingredientAliasesDelete,
        targetType: ADMIN_AUDIT_TARGET_TYPES.ingredientAlias,
        targetId: aliasId,
        beforeValues: snapshotAlias(before),
        afterValues: null,
        ...context
      });
    });
  }

  private async requireIngredient(ingredientId: number, db: Parameters<AdminIngredientRepository['findById']>[1]): Promise<Ingredient> {
    const ingredient = await this.ingredients.findById(ingredientId, db);
    if (!ingredient)
      throw notFound('Ingredient not found', 'ADMIN_INGREDIENTS_NOT_FOUND');

    return ingredient;
  }

  private async requireIngredientForUpdate(ingredientId: number, db: Parameters<AdminIngredientRepository['findByIdsForUpdate']>[1]): Promise<Ingredient> {
    const ingredient = (await this.ingredients.findByIdsForUpdate([ingredientId], db))[0];
    if (!ingredient)
      throw notFound('Ingredient not found', 'ADMIN_INGREDIENTS_NOT_FOUND');

    return ingredient;
  }

  private async requireAliasForUpdate(
    ingredientId: number,
    aliasId: number,
    db: Parameters<AdminIngredientRepository['findAliasForUpdate']>[2]
  ): Promise<IngredientAlias> {
    const alias = await this.ingredients.findAliasForUpdate(ingredientId, aliasId, db);
    if (!alias)
      throw notFound('Ingredient alias not found', 'ADMIN_INGREDIENT_ALIASES_NOT_FOUND');

    return alias;
  }

  private async rejectMergeSourceNameAliasChange(
    ingredientId: number,
    aliasId: number,
    db: Parameters<AdminIngredientRepository['isMergeSourceNameAlias']>[2]
  ): Promise<void> {
    if (await this.ingredients.isMergeSourceNameAlias(ingredientId, aliasId, db))
      throw conflict(
        'An alias preserving a merged ingredient source name cannot be changed',
        'ADMIN_INGREDIENT_ALIASES_MERGE_SOURCE_NAME_PROTECTED'
      );
  }
}

function validateCreateIngredientCommand(input: AdminCreateIngredientCommand) {
  if (!input || typeof input !== 'object')
    throw badRequest('Invalid ingredient creation', 'ADMIN_INGREDIENTS_CREATE_BAD_BODY');

  const name = validateName(input.name, 'Ingredient');
  const normalizedName = normalizeAndValidateName(name);

  return {
    name,
    normalizedName,
    slug: validateSlug(input.slug ?? normalizedName.replace(/ /g, '-'))
  };
}

function validateUpdateIngredientCommand(input: AdminUpdateIngredientCommand): AdminUpdateIngredientCommand {
  if (!input || typeof input !== 'object')
    throw badRequest('Invalid ingredient update', 'ADMIN_INGREDIENTS_UPDATE_BAD_BODY');
  if (input.name === undefined && input.slug === undefined)
    throw badRequest('At least one ingredient field must be provided', 'ADMIN_INGREDIENTS_UPDATE_EMPTY');

  return {
    ...(input.name === undefined ? {} : { name: validateName(input.name, 'Ingredient') }),
    ...(input.slug === undefined ? {} : { slug: validateSlug(input.slug) })
  };
}

function validateCreateAliasCommand(input: AdminCreateIngredientAliasCommand) {
  if (!input || typeof input !== 'object')
    throw badRequest('Invalid ingredient alias creation', 'ADMIN_INGREDIENT_ALIASES_CREATE_BAD_BODY');

  const name = validateName(input.name, 'Ingredient alias');

  return {
    name,
    normalizedName: normalizeAndValidateAliasName(name),
    languageCode: validateLanguageCode(input.languageCode)
  };
}

function validateUpdateAliasCommand(input: AdminUpdateIngredientAliasCommand): AdminUpdateIngredientAliasCommand {
  if (!input || typeof input !== 'object')
    throw badRequest('Invalid ingredient alias update', 'ADMIN_INGREDIENT_ALIASES_UPDATE_BAD_BODY');
  if (input.name === undefined && input.languageCode === undefined)
    throw badRequest('At least one ingredient alias field must be provided', 'ADMIN_INGREDIENT_ALIASES_UPDATE_EMPTY');

  return {
    ...(input.name === undefined ? {} : { name: validateName(input.name, 'Ingredient alias') }),
    ...(input.languageCode === undefined ? {} : { languageCode: validateLanguageCode(input.languageCode) })
  };
}

function validateName(value: unknown, label: 'Ingredient' | 'Ingredient alias'): string {
  const name = typeof value === 'string' ? value.trim() : '';
  const codePrefix = label === 'Ingredient' ? 'ADMIN_INGREDIENTS' : 'ADMIN_INGREDIENT_ALIASES';

  if (!name)
    throw badRequest(`${label} name is required`, `${codePrefix}_NAME_REQUIRED`);
  if (name.length > INGREDIENT_NAME_MAX_LENGTH)
    throw badRequest(`${label} name must be at most ${INGREDIENT_NAME_MAX_LENGTH} characters`, `${codePrefix}_NAME_TOO_LONG`);

  return name;
}

function normalizeAndValidateName(name: string): string {
  const normalizedName = normalizeIngredientName(name);
  if (!normalizedName)
    throw badRequest('Ingredient name must contain canonical letters or numbers', 'ADMIN_INGREDIENTS_NAME_INVALID');
  if (normalizedName.length > INGREDIENT_NAME_MAX_LENGTH)
    throw badRequest(`Normalized ingredient name must be at most ${INGREDIENT_NAME_MAX_LENGTH} characters`, 'ADMIN_INGREDIENTS_NAME_TOO_LONG');

  return normalizedName;
}

function normalizeAndValidateAliasName(name: string): string {
  const normalizedName = normalizeIngredientName(name);
  if (!normalizedName)
    throw badRequest('Ingredient alias name must contain canonical letters or numbers', 'ADMIN_INGREDIENT_ALIASES_NAME_INVALID');
  if (normalizedName.length > INGREDIENT_NAME_MAX_LENGTH)
    throw badRequest(`Normalized ingredient alias name must be at most ${INGREDIENT_NAME_MAX_LENGTH} characters`, 'ADMIN_INGREDIENT_ALIASES_NAME_TOO_LONG');

  return normalizedName;
}

function validateSlug(value: unknown): string {
  const slug = typeof value === 'string' ? value.trim() : '';
  if (!slug || slug.length > INGREDIENT_SLUG_MAX_LENGTH || !INGREDIENT_SLUG_PATTERN.test(slug))
    throw badRequest('Ingredient slug must contain lowercase letters, numbers and single hyphens', 'ADMIN_INGREDIENTS_SLUG_INVALID');

  return slug;
}

function validateLanguageCode(value: unknown): string {
  const languageCode = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!languageCode || languageCode.length > LANGUAGE_CODE_MAX_LENGTH || !LANGUAGE_CODE_PATTERN.test(languageCode))
    throw badRequest('Ingredient alias language code is invalid', 'ADMIN_INGREDIENT_ALIASES_LANGUAGE_CODE_INVALID');

  return languageCode;
}

function validateActionReason(reason: unknown, action: 'deprecate' | 'restore' | 'merge'): string {
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  const codePrefix = `ADMIN_INGREDIENTS_${action.toUpperCase()}`;

  if (!cleanReason)
    throw badRequest('Action reason is required', `${codePrefix}_REASON_REQUIRED`);
  if (cleanReason.length < ACTION_REASON_MIN_LENGTH)
    throw badRequest(`Action reason must be at least ${ACTION_REASON_MIN_LENGTH} characters`, `${codePrefix}_REASON_TOO_SHORT`);
  if (cleanReason.length > ACTION_REASON_MAX_LENGTH)
    throw badRequest(`Action reason must be at most ${ACTION_REASON_MAX_LENGTH} characters`, `${codePrefix}_REASON_TOO_LONG`);

  return cleanReason;
}

function requirePositiveId(value: unknown, label: string, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0)
    throw badRequest(`${label} must be a positive integer`, code);

  return Number(value);
}

function requireWrittenIngredient(result: AdminIngredientWriteResult): Ingredient {
  if (result.status === 'normalized_name_taken')
    throw conflict('An active ingredient already uses this canonical name', 'ADMIN_INGREDIENTS_NORMALIZED_NAME_TAKEN');
  if (result.status === 'slug_taken')
    throw conflict('An ingredient already uses this slug', 'ADMIN_INGREDIENTS_SLUG_TAKEN');

  return result.ingredient;
}

function requireWrittenAlias(result: AdminIngredientAliasWriteResult): IngredientAlias {
  if (result.status === 'alias_taken')
    throw conflict('This normalized alias already exists for the language', 'ADMIN_INGREDIENT_ALIASES_TAKEN');

  return result.alias;
}

function requireActiveAliasTarget(ingredient: Ingredient): void {
  if (ingredient.status !== 'active')
    throw conflict('Aliases can only be managed on active canonical ingredients', 'ADMIN_INGREDIENT_ALIASES_INVALID_INGREDIENT_STATUS');
}

function snapshotIngredientFilters(filters: AdminIngredientListFilters) {
  return { status: filters.status ?? null, q: filters.q ?? null };
}

function snapshotAliasFilters(filters: AdminIngredientAliasListFilters) {
  return { languageCode: filters.languageCode ?? null, q: filters.q ?? null };
}

function snapshotIngredient(ingredient: Ingredient) {
  return {
    name: ingredient.name,
    normalizedName: ingredient.normalizedName,
    slug: ingredient.slug,
    status: ingredient.status,
    mergedIntoIngredientId: ingredient.mergedIntoIngredientId,
    createdAt: ingredient.createdAt.toISOString(),
    updatedAt: ingredient.updatedAt.toISOString()
  };
}

function snapshotAlias(alias: IngredientAlias) {
  return {
    ingredientId: alias.ingredientId,
    name: alias.name,
    normalizedName: alias.normalizedName,
    languageCode: alias.languageCode,
    createdAt: alias.createdAt.toISOString(),
    updatedAt: alias.updatedAt.toISOString()
  };
}
