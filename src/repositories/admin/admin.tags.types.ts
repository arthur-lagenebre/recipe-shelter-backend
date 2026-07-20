import type { Tag, TagStatus } from '../tag/tag.types.js';

export type AdminTagListFilters = {
    status?: TagStatus;
    groupId?: number;
    q?: string;
};

export type AdminTagWriteInput = {
    groupId: number;
    name: string;
    normalizedName: string;
    slug: string;
    description: string | null;
};

export type AdminTagUpdateInput = AdminTagWriteInput & {
    id: number;
};

export type AdminTagWriteResult = { status: 'written'; tag: Tag } | { status: 'normalized_name_taken' } | { status: 'slug_taken' };

export type AdminTagRestoreResult = 'restored' | 'normalized_name_taken' | 'not_updated';

export type AdminTagMergeResult = {
    merged: boolean;
    sourceRecipeCountBefore: number;
    targetRecipeCountBefore: number;
    targetRecipeCountAfter: number;
    transferredRecipeCount: number;
    deduplicatedRecipeCount: number;
    redirectedMergedTagCount: number;
};
