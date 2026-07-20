import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapTag } from '../../../src/repositories/tag/tag.mapper.js';

import type { TagRow } from '../../../src/repositories/tag/tag.types.js';

describe('tag.mapper', () => {
    it('maps a tag with its group', () => {
        const createdAt = new Date('2026-07-19T10:00:00.000Z');
        const updatedAt = new Date('2026-07-20T11:00:00.000Z');

        assert.deepEqual(mapTag({
            Id: 1,
            Name: 'Végétarien',
            NormalizedName: 'vegetarien',
            Slug: 'vegetarien',
            Description: 'Recettes sans viande ni poisson',
            Status: 'merged',
            MergedIntoTagId: 3,
            CreatedAt: createdAt,
            UpdatedAt: updatedAt,
            GroupId: 2,
            GroupName: 'Régimes alimentaires',
            GroupSlug: 'regimes-alimentaires',
            GroupSortOrder: 1
        } as TagRow), {
            id: 1,
            name: 'Végétarien',
            normalizedName: 'vegetarien',
            slug: 'vegetarien',
            description: 'Recettes sans viande ni poisson',
            status: 'merged',
            mergedIntoTagId: 3,
            createdAt,
            updatedAt,
            group: {
                id: 2,
                name: 'Régimes alimentaires',
                slug: 'regimes-alimentaires',
                sortOrder: 1
            }
        });
    });
});
