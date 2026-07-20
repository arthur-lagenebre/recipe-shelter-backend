import type { AdminIngredientAliasListFilters, AdminIngredientAliasUpdateInput, AdminIngredientAliasWriteInput, AdminIngredientAliasWriteResult, AdminIngredientListFilters, AdminIngredientMergeResult, AdminIngredientRestoreResult, AdminIngredientUpdateInput, AdminIngredientWriteInput, AdminIngredientWriteResult } from './admin.ingredients.types.js';
import type { PaginatedResult, PaginationOptions } from '../../utils/pagination.js';
import type { Ingredient, IngredientAlias } from '../ingredients/ingredient.types.js';
import type { PoolConnection } from 'mysql2/promise';

export interface AdminIngredientRepository {
  find(filters: AdminIngredientListFilters, pagination: PaginationOptions, db?: PoolConnection): Promise<PaginatedResult<Ingredient>>;
  findById(ingredientId: number, db?: PoolConnection): Promise<Ingredient | null>;
  findByIdsForUpdate(ids: number[], db: PoolConnection): Promise<Ingredient[]>;
  create(input: AdminIngredientWriteInput, db: PoolConnection): Promise<AdminIngredientWriteResult>;
  update(input: AdminIngredientUpdateInput, db: PoolConnection): Promise<AdminIngredientWriteResult>;
  hasAliases(ingredientId: number, db: PoolConnection): Promise<boolean>;
  hasMergedSources(ingredientId: number, db: PoolConnection): Promise<boolean>;
  deprecate(ingredientId: number, db: PoolConnection): Promise<boolean>;
  restore(ingredientId: number, db: PoolConnection): Promise<AdminIngredientRestoreResult>;
  merge(sourceIngredientId: number, targetIngredientId: number, db: PoolConnection): Promise<AdminIngredientMergeResult>;
  findAliases(ingredientId: number, filters: AdminIngredientAliasListFilters, pagination: PaginationOptions, db?: PoolConnection): Promise<PaginatedResult<IngredientAlias>>;
  findAliasForUpdate(ingredientId: number, aliasId: number, db: PoolConnection): Promise<IngredientAlias | null>;
  createAlias(input: AdminIngredientAliasWriteInput, db: PoolConnection): Promise<AdminIngredientAliasWriteResult>;
  updateAlias(input: AdminIngredientAliasUpdateInput, db: PoolConnection): Promise<AdminIngredientAliasWriteResult>;
  deleteAlias(ingredientId: number, aliasId: number, db: PoolConnection): Promise<boolean>;
}
