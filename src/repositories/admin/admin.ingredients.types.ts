import type { Ingredient, IngredientAlias, IngredientStatus } from '../ingredients/ingredient.types.js';

export type AdminIngredientListFilters = {
  status?: IngredientStatus;
  q?: string;
};

export type AdminIngredientAliasListFilters = {
  languageCode?: string;
  q?: string;
};

export type AdminIngredientWriteInput = {
  name: string;
  normalizedName: string;
  slug: string;
};

export type AdminIngredientUpdateInput = AdminIngredientWriteInput & {
  id: number;
};

export type AdminIngredientWriteResult =
  | { status: 'written'; ingredient: Ingredient }
  | { status: 'normalized_name_taken' }
  | { status: 'slug_taken' };

export type AdminIngredientRestoreResult = 'restored' | 'normalized_name_taken' | 'not_updated';

export type AdminIngredientMergeInput = {
  sourceIngredientId: number;
  targetIngredientId: number;
  sourceName: string;
  sourceNormalizedName: string;
  sourceNameLanguageCode: string;
};

export type AdminIngredientMergeSuccess = {
  status: 'merged';
  sourceRecipeAssociationCountBefore: number;
  targetRecipeAssociationCountBefore: number;
  targetRecipeAssociationCountAfter: number;
  transferredRecipeAssociationCount: number;
  sourceAliasCountBefore: number;
  targetAliasCountBefore: number;
  targetAliasCountAfter: number;
  transferredAliasCount: number;
  sourceNameAliasResolution: 'created' | 'reused_source_alias' | 'reused_target_alias';
  redirectedMergedIngredientCount: number;
};

export type AdminIngredientMergeResult =
  | AdminIngredientMergeSuccess
  | { status: 'not_merged' }
  | { status: 'source_name_alias_conflict'; conflictingIngredientId: number | null };

export type AdminIngredientAliasWriteInput = {
  ingredientId: number;
  name: string;
  normalizedName: string;
  languageCode: string;
};

export type AdminIngredientAliasUpdateInput = AdminIngredientAliasWriteInput & {
  id: number;
};

export type AdminIngredientAliasWriteResult =
  | { status: 'written'; alias: IngredientAlias }
  | { status: 'alias_taken' };
