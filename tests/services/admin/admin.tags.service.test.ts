import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { createPaginatedResult } from '../../../src/utils/pagination.js';
import { AdminTagService } from '../../../src/services/admin/admin.tags.service.js';
import { HttpError } from '../../../src/utils/errors.js';
import { TestAdminAuditRecorder, testAdminAuditContext } from '../../helpers/admin-audit.js';

import type { AdminTagRepository } from '../../../src/repositories/admin/admin.tags.repository.interface.js';
import type { AdminTagListFilters, AdminTagMergeResult, AdminTagRestoreResult, AdminTagUpdateInput, AdminTagWriteInput, AdminTagWriteResult } from '../../../src/repositories/admin/admin.tags.types.js';
import type { Tag } from '../../../src/repositories/tag/tag.types.js';
import type { PaginationOptions } from '../../../src/utils/pagination.js';

const actorUserId = 91;
const pagination: PaginationOptions = { page: 1, limit: 25, offset: 0 };

class FakeAdminTagRepository implements AdminTagRepository {
  readonly groups = new Set([1, 2]);
  readonly tags = new Map<number, Tag>([
    [1, createTag(1, 'Rapide', 'rapide', 'rapide')],
    [2, createTag(2, 'Express', 'express', 'express')],
    [3, createTag(3, 'Ancien', 'ancien', 'ancien', 'deprecated')],
    [4, createTag(4, 'Alias historique', 'alias historique', 'alias-historique', 'merged', 1)]
  ]);
  nextId = 10;
  mergeCounts: AdminTagMergeResult = {
    merged: true,
    sourceRecipeCountBefore: 3,
    targetRecipeCountBefore: 2,
    targetRecipeCountAfter: 4,
    transferredRecipeCount: 2,
    deduplicatedRecipeCount: 1,
    redirectedMergedTagCount: 1
  };

  async find(filters: AdminTagListFilters, page: PaginationOptions) {
    const matching = [...this.tags.values()].filter((tag) =>
      (filters.status === undefined || tag.status === filters.status)
      && (filters.groupId === undefined || tag.group.id === filters.groupId)
      && (filters.q === undefined || tag.name.toLowerCase().includes(filters.q.toLowerCase()))
    );
    const items = matching.slice(page.offset, page.offset + page.limit).map(cloneTag);
    return createPaginatedResult(items, matching.length, page);
  }

  async findByIdsForUpdate(ids: number[]): Promise<Tag[]> {
    return ids.flatMap((id) => {
      const tag = this.tags.get(id);
      return tag ? [cloneTag(tag)] : [];
    });
  }

  async groupExists(groupId: number): Promise<boolean> {
    return this.groups.has(groupId);
  }

  async create(input: AdminTagWriteInput): Promise<AdminTagWriteResult> {
    const duplicate = this.findDuplicate(input.normalizedName, input.slug);
    if (duplicate)
      return { status: duplicate };

    const tag = createTag(this.nextId++, input.name, input.normalizedName, input.slug);
    tag.description = input.description;
    tag.group = createGroup(input.groupId);
    this.tags.set(tag.id, tag);
    return { status: 'written', tag: cloneTag(tag) };
  }

  async update(input: AdminTagUpdateInput): Promise<AdminTagWriteResult> {
    const duplicate = this.findDuplicate(input.normalizedName, input.slug, input.id);
    if (duplicate)
      return { status: duplicate };

    const tag = this.tags.get(input.id)!;
    Object.assign(tag, {
      name: input.name,
      normalizedName: input.normalizedName,
      slug: input.slug,
      description: input.description,
      group: createGroup(input.groupId),
      updatedAt: new Date('2026-07-20T11:00:00.000Z')
    });
    return { status: 'written', tag: cloneTag(tag) };
  }

  async hasMergedAliases(tagId: number): Promise<boolean> {
    return [...this.tags.values()].some((tag) => tag.mergedIntoTagId === tagId);
  }

  async deprecate(tagId: number): Promise<boolean> {
    const tag = this.tags.get(tagId);
    if (!tag || tag.status !== 'active')
      return false;

    tag.status = 'deprecated';
    tag.mergedIntoTagId = null;
    tag.updatedAt = new Date('2026-07-20T11:00:00.000Z');
    return true;
  }

  async restore(tagId: number): Promise<AdminTagRestoreResult> {
    const tag = this.tags.get(tagId);
    if (!tag || tag.status !== 'deprecated')
      return 'not_updated';
    if ([...this.tags.values()].some((candidate) =>
      candidate.id !== tagId
      && candidate.status === 'active'
      && candidate.normalizedName === tag.normalizedName
    ))
      return 'normalized_name_taken';

    tag.status = 'active';
    tag.updatedAt = new Date('2026-07-20T11:00:00.000Z');
    return 'restored';
  }

  async merge(sourceTagId: number, targetTagId: number): Promise<AdminTagMergeResult> {
    if (!this.mergeCounts.merged)
      return this.mergeCounts;

    for (const tag of this.tags.values()) {
      if (tag.mergedIntoTagId === sourceTagId)
        tag.mergedIntoTagId = targetTagId;
    }
    const source = this.tags.get(sourceTagId)!;
    source.status = 'merged';
    source.mergedIntoTagId = targetTagId;
    source.updatedAt = new Date('2026-07-20T11:00:00.000Z');
    return this.mergeCounts;
  }

  private findDuplicate(normalizedName: string, slug: string, excludedId?: number): 'normalized_name_taken' | 'slug_taken' | null {
    const candidates = [...this.tags.values()].filter((tag) => tag.id !== excludedId);

    if (candidates.some((tag) => tag.status === 'active' && tag.normalizedName === normalizedName))
      return 'normalized_name_taken';
    if (candidates.some((tag) => tag.slug === slug))
      return 'slug_taken';
    return null;
  }
}

describe('AdminTagService', () => {
  let repository: FakeAdminTagRepository;
  let audit: TestAdminAuditRecorder;
  let service: AdminTagService;

  beforeEach(() => {
    repository = new FakeAdminTagRepository();
    audit = new TestAdminAuditRecorder();
    service = new AdminTagService(repository, audit);
  });

  it('returns a paginated filtered list and audits the read', async () => {
    const result = await service.list({ status: 'active', q: 'rap' }, pagination, actorUserId, testAdminAuditContext);

    assert.deepEqual(result.items.map((tag) => tag.id), [1]);
    assert.equal(result.pagination.totalItems, 1);
    assert.deepEqual(audit.inputs.map((input) => ({
      eventType: input.eventType,
      targetType: input.targetType,
      targetId: input.targetId,
      afterValues: input.afterValues
    })), [{
      eventType: 'tags.list',
      targetType: 'tag_collection',
      targetId: 'all',
      afterValues: {
        resultCount: 1,
        totalItems: 1,
        page: 1,
        limit: 25,
        filters: { status: 'active', groupId: null, q: 'rap' }
      }
    }]);
  });

  it('creates a normalized canonical tag with a generated slug and audit snapshot', async () => {
    const tag = await service.create({
      groupId: 2,
      name: '  Crème brûlée  ',
      description: '  Dessert classique.  '
    }, actorUserId, testAdminAuditContext);

    assert.deepEqual({
      name: tag.name,
      normalizedName: tag.normalizedName,
      slug: tag.slug,
      description: tag.description,
      groupId: tag.group.id,
      status: tag.status
    }, {
      name: 'Crème brûlée',
      normalizedName: 'creme brulee',
      slug: 'creme-brulee',
      description: 'Dessert classique.',
      groupId: 2,
      status: 'active'
    });
    assert.equal(audit.inputs[0]?.eventType, 'tags.create');
    assert.equal(audit.inputs[0]?.targetId, tag.id);
    assert.equal(audit.inputs[0]?.beforeValues, undefined);
    assert.equal(audit.inputs[0]?.afterValues?.normalizedName, 'creme brulee');
  });

  it('rejects missing groups and canonical identity conflicts without audit', async () => {
    await assert.rejects(
      () => service.create({ groupId: 999, name: 'Nouveau' }, actorUserId, testAdminAuditContext),
      (error) => assertHttpError(error, 404, 'ADMIN_TAGS_GROUP_NOT_FOUND')
    );
    await assert.rejects(
      () => service.create({ groupId: 1, name: 'RAPIDE', slug: 'autre-slug' }, actorUserId, testAdminAuditContext),
      (error) => assertHttpError(error, 409, 'ADMIN_TAGS_NORMALIZED_NAME_TAKEN')
    );
    await assert.rejects(
      () => service.create({ groupId: 1, name: 'Autre', slug: 'rapide' }, actorUserId, testAdminAuditContext),
      (error) => assertHttpError(error, 409, 'ADMIN_TAGS_SLUG_TAKEN')
    );
    assert.equal(audit.inputs.length, 0);
  });

  it('updates only active tags, recomputes their normalized name and audits before/after state', async () => {
    const tag = await service.update(2, {
      groupId: 2,
      name: 'Très rapide',
      description: null
    }, actorUserId, testAdminAuditContext);

    assert.deepEqual({
      name: tag.name,
      normalizedName: tag.normalizedName,
      slug: tag.slug,
      description: tag.description,
      groupId: tag.group.id
    }, {
      name: 'Très rapide',
      normalizedName: 'tres rapide',
      slug: 'express',
      description: null,
      groupId: 2
    });
    assert.equal(audit.inputs[0]?.eventType, 'tags.update');
    assert.equal(audit.inputs[0]?.beforeValues?.name, 'Express');
    assert.equal(audit.inputs[0]?.afterValues?.name, 'Très rapide');

    audit.inputs.length = 0;
    await assert.rejects(
      () => service.update(3, { name: 'Historique modifié' }, actorUserId, testAdminAuditContext),
      (error) => assertHttpError(error, 409, 'ADMIN_TAGS_UPDATE_INVALID_STATUS')
    );
    assert.equal(audit.inputs.length, 0);
  });

  it('deprecates and restores a tag with distinct audited lifecycle events', async () => {
    const deprecated = await service.deprecate(2, 'Tag devenu obsolète.', actorUserId, testAdminAuditContext);
    assert.equal(deprecated.status, 'deprecated');

    const restored = await service.restore(2, 'Retour dans le catalogue.', actorUserId, testAdminAuditContext);
    assert.equal(restored.status, 'active');
    assert.deepEqual(audit.inputs.map((input) => ({ eventType: input.eventType, reason: input.reason })), [
      { eventType: 'tags.deprecate', reason: 'Tag devenu obsolète.' },
      { eventType: 'tags.restore', reason: 'Retour dans le catalogue.' }
    ]);
  });

  it('rejects invalid lifecycle transitions and canonical targets without audit', async () => {
    await assert.rejects(
      () => service.deprecate(1, 'Cible encore utilisée.', actorUserId, testAdminAuditContext),
      (error) => assertHttpError(error, 409, 'ADMIN_TAGS_DEPRECATE_CANONICAL_TARGET')
    );
    await assert.rejects(
      () => service.restore(1, 'Tentative de restauration.', actorUserId, testAdminAuditContext),
      (error) => assertHttpError(error, 409, 'ADMIN_TAGS_RESTORE_INVALID_STATUS')
    );

    repository.tags.set(5, createTag(5, 'Ancien rapide', 'rapide', 'ancien-rapide', 'deprecated'));
    await assert.rejects(
      () => service.restore(5, 'Collision canonique active.', actorUserId, testAdminAuditContext),
      (error) => assertHttpError(error, 409, 'ADMIN_TAGS_NORMALIZED_NAME_TAKEN')
    );
    assert.equal(audit.inputs.length, 0);
  });

  it('merges into an active canonical target and records relationship counts', async () => {
    repository.tags.get(4)!.mergedIntoTagId = 2;
    const targetBefore = cloneTag(repository.tags.get(1)!);
    const merged = await service.merge(2, {
      targetTagId: 1,
      reason: 'Doublon du tag canonique.'
    }, actorUserId, testAdminAuditContext);

    assert.equal(merged.status, 'merged');
    assert.equal(merged.mergedIntoTagId, 1);
    assert.equal(repository.tags.get(4)?.mergedIntoTagId, 1);
    assert.deepEqual(repository.tags.get(1), targetBefore);
    assert.deepEqual({
      eventType: audit.inputs[0]?.eventType,
      reason: audit.inputs[0]?.reason,
      targetId: audit.inputs[0]?.targetId,
      beforeValues: audit.inputs[0]?.beforeValues,
      afterValues: audit.inputs[0]?.afterValues
    }, {
      eventType: 'tags.merge',
      reason: 'Doublon du tag canonique.',
      targetId: 2,
      beforeValues: {
        source: snapshotTagForTest(createTag(2, 'Express', 'express', 'express')),
        target: snapshotTagForTest(targetBefore),
        recipeAssociations: {
          sourceCount: 3,
          targetCount: 2,
          sharedCount: 1
        },
        aliasesPointingToSourceCount: 1
      },
      afterValues: {
        source: snapshotTagForTest(merged),
        target: snapshotTagForTest(targetBefore),
        recipeAssociations: {
          sourceCount: 0,
          targetCount: 4
        },
        aliasesPointingToSourceCount: 0,
        transfer: {
          transferredRecipeCount: 2,
          deduplicatedRecipeCount: 1,
          redirectedMergedTagCount: 1
        }
      }
    });
  });

  it('merges a deprecated source with no relationships and audits zero-value snapshots', async () => {
    repository.mergeCounts = {
      merged: true,
      sourceRecipeCountBefore: 0,
      targetRecipeCountBefore: 0,
      targetRecipeCountAfter: 0,
      transferredRecipeCount: 0,
      deduplicatedRecipeCount: 0,
      redirectedMergedTagCount: 0
    };

    const merged = await service.merge(3, {
      targetTagId: 2,
      reason: 'Ancien tag remplacé sans association.'
    }, actorUserId, testAdminAuditContext);

    assert.equal(merged.status, 'merged');
    assert.equal(merged.mergedIntoTagId, 2);
    assert.equal(audit.inputs[0]?.beforeValues?.aliasesPointingToSourceCount, 0);
    assert.deepEqual(audit.inputs[0]?.beforeValues?.recipeAssociations, {
      sourceCount: 0,
      targetCount: 0,
      sharedCount: 0
    });
    assert.deepEqual(audit.inputs[0]?.afterValues?.transfer, {
      transferredRecipeCount: 0,
      deduplicatedRecipeCount: 0,
      redirectedMergedTagCount: 0
    });
  });

  it('rejects self-merges, missing targets, invalid statuses and concurrent changes without audit', async () => {
    await assert.rejects(
      () => service.merge(1, null as never, actorUserId, testAdminAuditContext),
      (error) => assertHttpError(error, 400, 'ADMIN_TAGS_MERGE_BAD_BODY')
    );
    await assert.rejects(
      () => service.merge(1, { targetTagId: 0, reason: 'Identifiant de cible invalide.' }, actorUserId, testAdminAuditContext),
      (error) => assertHttpError(error, 400, 'ADMIN_TAGS_MERGE_BAD_TARGET_ID')
    );
    await assert.rejects(
      () => service.merge(1, { targetTagId: 1, reason: 'Fusion impossible sur soi.' }, actorUserId, testAdminAuditContext),
      (error) => assertHttpError(error, 400, 'ADMIN_TAGS_MERGE_SELF')
    );
    await assert.rejects(
      () => service.merge(999, { targetTagId: 1, reason: 'Source absente du catalogue.' }, actorUserId, testAdminAuditContext),
      (error) => assertHttpError(error, 404, 'ADMIN_TAGS_NOT_FOUND')
    );
    await assert.rejects(
      () => service.merge(1, { targetTagId: 999, reason: 'Cible absente du catalogue.' }, actorUserId, testAdminAuditContext),
      (error) => assertHttpError(error, 404, 'ADMIN_TAGS_MERGE_TARGET_NOT_FOUND')
    );
    await assert.rejects(
      () => service.merge(1, { targetTagId: 3, reason: 'Cible dépréciée interdite.' }, actorUserId, testAdminAuditContext),
      (error) => assertHttpError(error, 409, 'ADMIN_TAGS_MERGE_INVALID_TARGET_STATUS')
    );
    await assert.rejects(
      () => service.merge(4, { targetTagId: 2, reason: 'Source déjà fusionnée.' }, actorUserId, testAdminAuditContext),
      (error) => assertHttpError(error, 409, 'ADMIN_TAGS_MERGE_INVALID_SOURCE_STATUS')
    );

    repository.mergeCounts.merged = false;
    await assert.rejects(
      () => service.merge(2, { targetTagId: 1, reason: 'Conflit concurrent simulé.' }, actorUserId, testAdminAuditContext),
      (error) => assertHttpError(error, 409, 'ADMIN_TAGS_STATUS_CONFLICT')
    );
    assert.equal(audit.inputs.length, 0);
  });
});

function createTag(id: number, name: string, normalizedName: string, slug: string, status: Tag['status'] = 'active', mergedIntoTagId: number | null = null): Tag {
  return {
    id,
    name,
    normalizedName,
    slug,
    description: null,
    status,
    mergedIntoTagId,
    createdAt: new Date('2026-07-20T10:00:00.000Z'),
    updatedAt: new Date('2026-07-20T10:00:00.000Z'),
    group: createGroup(1)
  };
}

function createGroup(id: number): Tag['group'] {
  return {
    id,
    name: `Group ${id}`,
    slug: `group-${id}`,
    sortOrder: id
  };
}

function cloneTag(tag: Tag): Tag {
  return {
    ...tag,
    createdAt: new Date(tag.createdAt),
    updatedAt: new Date(tag.updatedAt),
    group: { ...tag.group }
  };
}

function snapshotTagForTest(tag: Tag) {
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

function assertHttpError(error: unknown, status: number, code: string): boolean {
  assert.ok(error instanceof HttpError);
  assert.equal(error.statusCode, status);
  assert.equal(error.code, code);
  return true;
}
