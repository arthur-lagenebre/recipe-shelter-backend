import { ADMIN_AUDIT_EVENT_TYPES, ADMIN_AUDIT_TARGET_TYPES } from './admin-audit.events.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { normalizeTagName } from '../tag/tags.service.js';

import type { AdminAuditActionRunner } from './admin-audit-action.runner.js';
import type { AdminAuditRequestContext } from './admin-audit.service.js';
import type { AdminTagRepository } from '../../repositories/admin/admin.tags.repository.interface.js';
import type { AdminTagListFilters, AdminTagWriteResult } from '../../repositories/admin/admin.tags.types.js';
import type { Tag } from '../../repositories/tag/tag.types.js';
import type { PaginatedResult, PaginationOptions } from '../../utils/pagination.js';

const TAG_NAME_MAX_LENGTH = 255;
const TAG_SLUG_MAX_LENGTH = 255;
const TAG_DESCRIPTION_MAX_LENGTH = 1000;
const ACTION_REASON_MIN_LENGTH = 10;
const ACTION_REASON_MAX_LENGTH = 1000;
const TAG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type AdminCreateTagCommand = {
  groupId: number;
  name: string;
  slug?: string;
  description?: string | null;
};

export type AdminUpdateTagCommand = {
  groupId?: number;
  name?: string;
  slug?: string;
  description?: string | null;
};

export type AdminMergeTagCommand = {
  targetTagId: number;
  reason: string;
};

export class AdminTagService {
  constructor(private readonly tags: AdminTagRepository, private readonly auditActions: AdminAuditActionRunner) { }

  async list(filters: AdminTagListFilters, pagination: PaginationOptions, actorUserId: number, context: AdminAuditRequestContext): Promise<PaginatedResult<Tag>> {
    return this.auditActions.run(async ({ db, audit }) => {
      const result = await this.tags.find(filters, pagination, db);

      await audit.record({
        actorUserId,
        eventType: ADMIN_AUDIT_EVENT_TYPES.tagsList,
        targetType: ADMIN_AUDIT_TARGET_TYPES.tagCollection,
        targetId: 'all',
        afterValues: {
          resultCount: result.items.length,
          totalItems: result.pagination.totalItems,
          page: result.pagination.page,
          limit: result.pagination.limit,
          filters: snapshotFilters(filters)
        },
        ...context
      });

      return result;
    });
  }

  async create(input: AdminCreateTagCommand, actorUserId: number, context: AdminAuditRequestContext): Promise<Tag> {
    const command = validateCreateCommand(input);

    return this.auditActions.run(async ({ db, audit }) => {
      await this.requireGroup(command.groupId, db);
      const result = await this.tags.create(command, db);
      const tag = requireWrittenTag(result);

      await audit.record({
        actorUserId,
        eventType: ADMIN_AUDIT_EVENT_TYPES.tagsCreate,
        targetType: ADMIN_AUDIT_TARGET_TYPES.tag,
        targetId: tag.id,
        afterValues: snapshotTag(tag),
        ...context
      });

      return tag;
    });
  }

  async update(tagId: number, input: AdminUpdateTagCommand, actorUserId: number, context: AdminAuditRequestContext): Promise<Tag> {
    requirePositiveId(tagId, 'Tag id', 'ADMIN_TAGS_BAD_ID');
    const command = validateUpdateCommand(input);

    return this.auditActions.run(async ({ db, audit }) => {
      const before = await this.requireTagForUpdate(tagId, db);

      if (before.status !== 'active')
        throw conflict('Only an active tag can be modified', 'ADMIN_TAGS_UPDATE_INVALID_STATUS');

      const groupId = command.groupId ?? before.group.id;
      if (groupId !== before.group.id)
        await this.requireGroup(groupId, db);

      const name = command.name ?? before.name;
      const normalizedName = command.name === undefined ? before.normalizedName : normalizeAndValidateName(name);
      const result = await this.tags.update({
        id: tagId,
        groupId,
        name,
        normalizedName,
        slug: command.slug ?? before.slug,
        description: command.description === undefined ? before.description : command.description
      }, db);
      const tag = requireWrittenTag(result);

      await audit.record({
        actorUserId,
        eventType: ADMIN_AUDIT_EVENT_TYPES.tagsUpdate,
        targetType: ADMIN_AUDIT_TARGET_TYPES.tag,
        targetId: tag.id,
        beforeValues: snapshotTag(before),
        afterValues: snapshotTag(tag),
        ...context
      });

      return tag;
    });
  }

  async deprecate(tagId: number, reason: string, actorUserId: number, context: AdminAuditRequestContext): Promise<Tag> {
    requirePositiveId(tagId, 'Tag id', 'ADMIN_TAGS_BAD_ID');
    const cleanReason = validateActionReason(reason, 'deprecate');

    return this.auditActions.run(async ({ db, audit }) => {
      const before = await this.requireTagForUpdate(tagId, db);

      if (before.status !== 'active')
        throw conflict('Only an active tag can be deprecated', 'ADMIN_TAGS_DEPRECATE_INVALID_STATUS');
      if (await this.tags.hasMergedAliases(tagId, db))
        throw conflict('A canonical merge target cannot be deprecated', 'ADMIN_TAGS_DEPRECATE_CANONICAL_TARGET');
      if (!await this.tags.deprecate(tagId, db))
        throw conflict('Tag status changed concurrently', 'ADMIN_TAGS_STATUS_CONFLICT');

      const after = await this.requireTagForUpdate(tagId, db);
      await audit.record({
        actorUserId,
        eventType: ADMIN_AUDIT_EVENT_TYPES.tagsDeprecate,
        targetType: ADMIN_AUDIT_TARGET_TYPES.tag,
        targetId: tagId,
        reason: cleanReason,
        beforeValues: snapshotTag(before),
        afterValues: snapshotTag(after),
        ...context
      });

      return after;
    });
  }

  async restore(tagId: number, reason: string, actorUserId: number, context: AdminAuditRequestContext): Promise<Tag> {
    requirePositiveId(tagId, 'Tag id', 'ADMIN_TAGS_BAD_ID');
    const cleanReason = validateActionReason(reason, 'restore');

    return this.auditActions.run(async ({ db, audit }) => {
      const before = await this.requireTagForUpdate(tagId, db);

      if (before.status !== 'deprecated')
        throw conflict('Only a deprecated tag can be restored', 'ADMIN_TAGS_RESTORE_INVALID_STATUS');

      const result = await this.tags.restore(tagId, db);
      if (result === 'normalized_name_taken')
        throw conflict('An active tag already uses this canonical name', 'ADMIN_TAGS_NORMALIZED_NAME_TAKEN');
      if (result !== 'restored')
        throw conflict('Tag status changed concurrently', 'ADMIN_TAGS_STATUS_CONFLICT');

      const after = await this.requireTagForUpdate(tagId, db);
      await audit.record({
        actorUserId,
        eventType: ADMIN_AUDIT_EVENT_TYPES.tagsRestore,
        targetType: ADMIN_AUDIT_TARGET_TYPES.tag,
        targetId: tagId,
        reason: cleanReason,
        beforeValues: snapshotTag(before),
        afterValues: snapshotTag(after),
        ...context
      });

      return after;
    });
  }

  async merge(sourceTagId: number, input: AdminMergeTagCommand, actorUserId: number, context: AdminAuditRequestContext): Promise<Tag> {
    requirePositiveId(sourceTagId, 'Tag id', 'ADMIN_TAGS_BAD_ID');
    if (!input || typeof input !== 'object')
      throw badRequest('Invalid tag merge', 'ADMIN_TAGS_MERGE_BAD_BODY');
    requirePositiveId(input.targetTagId, 'Merge target tag id', 'ADMIN_TAGS_MERGE_BAD_TARGET_ID');
    const cleanReason = validateActionReason(input.reason, 'merge');

    if (sourceTagId === input.targetTagId)
      throw badRequest('A tag cannot be merged into itself', 'ADMIN_TAGS_MERGE_SELF');

    return this.auditActions.run(async ({ db, audit }) => {
      const lockedTags = await this.tags.findByIdsForUpdate(
        [sourceTagId, input.targetTagId].sort((left, right) => left - right),
        db
      );
      const source = lockedTags.find((tag) => tag.id === sourceTagId);
      const target = lockedTags.find((tag) => tag.id === input.targetTagId);

      if (!source)
        throw notFound('Tag not found', 'ADMIN_TAGS_NOT_FOUND');
      if (!target)
        throw notFound('Merge target tag not found', 'ADMIN_TAGS_MERGE_TARGET_NOT_FOUND');
      if (source.status === 'merged')
        throw conflict('A merged tag cannot be merged again', 'ADMIN_TAGS_MERGE_INVALID_SOURCE_STATUS');
      if (target.status !== 'active')
        throw conflict('A merge target must be active', 'ADMIN_TAGS_MERGE_INVALID_TARGET_STATUS');

      const result = await this.tags.merge(sourceTagId, target.id, db);
      if (!result.merged)
        throw conflict('Tag status changed concurrently', 'ADMIN_TAGS_STATUS_CONFLICT');

      const after = await this.requireTagForUpdate(sourceTagId, db);
      await audit.record({
        actorUserId,
        eventType: ADMIN_AUDIT_EVENT_TYPES.tagsMerge,
        targetType: ADMIN_AUDIT_TARGET_TYPES.tag,
        targetId: sourceTagId,
        reason: cleanReason,
        beforeValues: {
          source: snapshotTag(source),
          target: snapshotTag(target),
          recipeAssociations: {
            sourceCount: result.sourceRecipeCountBefore,
            targetCount: result.targetRecipeCountBefore,
            sharedCount: result.deduplicatedRecipeCount
          },
          aliasesPointingToSourceCount: result.redirectedMergedTagCount
        },
        afterValues: {
          source: snapshotTag(after),
          target: snapshotTag(target),
          recipeAssociations: {
            sourceCount: 0,
            targetCount: result.targetRecipeCountAfter
          },
          aliasesPointingToSourceCount: 0,
          transfer: {
            transferredRecipeCount: result.transferredRecipeCount,
            deduplicatedRecipeCount: result.deduplicatedRecipeCount,
            redirectedMergedTagCount: result.redirectedMergedTagCount
          }
        },
        ...context
      });

      return after;
    });
  }

  private async requireTagForUpdate(tagId: number, db: Parameters<AdminTagRepository['findByIdsForUpdate']>[1]): Promise<Tag> {
    const tag = (await this.tags.findByIdsForUpdate([tagId], db))[0];

    if (!tag)
      throw notFound('Tag not found', 'ADMIN_TAGS_NOT_FOUND');

    return tag;
  }

  private async requireGroup(groupId: number, db: Parameters<AdminTagRepository['groupExists']>[1]): Promise<void> {
    if (!await this.tags.groupExists(groupId, db))
      throw notFound('Tag group not found', 'ADMIN_TAGS_GROUP_NOT_FOUND');
  }
}

function validateCreateCommand(input: AdminCreateTagCommand) {
  if (!input || typeof input !== 'object')
    throw badRequest('Invalid tag creation', 'ADMIN_TAGS_CREATE_BAD_BODY');

  const groupId = requirePositiveId(input.groupId, 'Tag group id', 'ADMIN_TAGS_BAD_GROUP_ID');
  const name = validateName(input.name);
  const normalizedName = normalizeAndValidateName(name);
  const slug = validateSlug(input.slug ?? normalizedName.replace(/ /g, '-'));
  const description = validateDescription(input.description);

  return { groupId, name, normalizedName, slug, description };
}

function validateUpdateCommand(input: AdminUpdateTagCommand): AdminUpdateTagCommand {
  if (!input || typeof input !== 'object')
    throw badRequest('Invalid tag update', 'ADMIN_TAGS_UPDATE_BAD_BODY');
  if (input.groupId === undefined && input.name === undefined && input.slug === undefined && input.description === undefined)
    throw badRequest('At least one tag field must be provided', 'ADMIN_TAGS_UPDATE_EMPTY');

  return {
    ...(input.groupId === undefined ? {} : { groupId: requirePositiveId(input.groupId, 'Tag group id', 'ADMIN_TAGS_BAD_GROUP_ID') }),
    ...(input.name === undefined ? {} : { name: validateName(input.name) }),
    ...(input.slug === undefined ? {} : { slug: validateSlug(input.slug) }),
    ...(input.description === undefined ? {} : { description: validateDescription(input.description) })
  };
}

function validateName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';

  if (!name)
    throw badRequest('Tag name is required', 'ADMIN_TAGS_NAME_REQUIRED');
  if (name.length > TAG_NAME_MAX_LENGTH)
    throw badRequest(`Tag name must be at most ${TAG_NAME_MAX_LENGTH} characters`, 'ADMIN_TAGS_NAME_TOO_LONG');

  return name;
}

function normalizeAndValidateName(name: string): string {
  const normalizedName = normalizeTagName(name);

  if (!normalizedName)
    throw badRequest('Tag name must contain canonical letters or numbers', 'ADMIN_TAGS_NAME_INVALID');
  if (normalizedName.length > TAG_NAME_MAX_LENGTH)
    throw badRequest(`Normalized tag name must be at most ${TAG_NAME_MAX_LENGTH} characters`, 'ADMIN_TAGS_NAME_TOO_LONG');

  return normalizedName;
}

function validateSlug(value: unknown): string {
  const slug = typeof value === 'string' ? value.trim() : '';

  if (!slug || slug.length > TAG_SLUG_MAX_LENGTH || !TAG_SLUG_PATTERN.test(slug))
    throw badRequest('Tag slug must contain lowercase letters, numbers and single hyphens', 'ADMIN_TAGS_SLUG_INVALID');

  return slug;
}

function validateDescription(value: unknown): string | null {
  if (value === undefined || value === null)
    return null;
  if (typeof value !== 'string')
    throw badRequest('Tag description must be a string or null', 'ADMIN_TAGS_DESCRIPTION_INVALID');

  const description = value.trim();
  if (!description)
    throw badRequest('Tag description cannot be blank', 'ADMIN_TAGS_DESCRIPTION_INVALID');
  if (description.length > TAG_DESCRIPTION_MAX_LENGTH)
    throw badRequest(`Tag description must be at most ${TAG_DESCRIPTION_MAX_LENGTH} characters`, 'ADMIN_TAGS_DESCRIPTION_TOO_LONG');

  return description;
}

function validateActionReason(reason: unknown, action: 'deprecate' | 'restore' | 'merge'): string {
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  const codePrefix = `ADMIN_TAGS_${action.toUpperCase()}`;

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

function requireWrittenTag(result: AdminTagWriteResult): Tag {
  if (result.status === 'normalized_name_taken')
    throw conflict('An active tag already uses this canonical name', 'ADMIN_TAGS_NORMALIZED_NAME_TAKEN');
  if (result.status === 'slug_taken')
    throw conflict('A tag already uses this slug', 'ADMIN_TAGS_SLUG_TAKEN');

  return result.tag;
}

function snapshotFilters(filters: AdminTagListFilters) {
  return {
    status: filters.status ?? null,
    groupId: filters.groupId ?? null,
    q: filters.q ?? null
  };
}

function snapshotTag(tag: Tag) {
  return {
    groupId: tag.group.id,
    name: tag.name,
    normalizedName: tag.normalizedName,
    slug: tag.slug,
    description: tag.description,
    status: tag.status,
    mergedIntoTagId: tag.mergedIntoTagId,
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString()
  };
}
