import type { AdminTagListFilters, AdminTagMergeResult, AdminTagRestoreResult, AdminTagUpdateInput, AdminTagWriteInput, AdminTagWriteResult } from './admin.tags.types.js';
import type { PaginatedResult, PaginationOptions } from '../../utils/pagination.js';
import type { Tag } from '../tag/tag.types.js';
import type { PoolConnection } from 'mysql2/promise';

export interface AdminTagRepository {
  find(filters: AdminTagListFilters, pagination: PaginationOptions, db?: PoolConnection): Promise<PaginatedResult<Tag>>;
  findByIdsForUpdate(ids: number[], db: PoolConnection): Promise<Tag[]>;
  groupExists(groupId: number, db: PoolConnection): Promise<boolean>;
  create(input: AdminTagWriteInput, db: PoolConnection): Promise<AdminTagWriteResult>;
  update(input: AdminTagUpdateInput, db: PoolConnection): Promise<AdminTagWriteResult>;
  hasMergedAliases(tagId: number, db: PoolConnection): Promise<boolean>;
  deprecate(tagId: number, db: PoolConnection): Promise<boolean>;
  restore(tagId: number, db: PoolConnection): Promise<AdminTagRestoreResult>;
  merge(sourceTagId: number, targetTagId: number, db: PoolConnection): Promise<AdminTagMergeResult>;
}
