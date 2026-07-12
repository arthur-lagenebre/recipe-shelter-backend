import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapTag } from '../../../src/repositories/tag/tag.mappers.js';

import type { TagRow } from '../../../src/repositories/tag/tag.types.js';

describe('tag.mapper', () => {
    it('maps a tag with its group', () => {
        assert.deepEqual(mapTag({
            Id: 1,
            Name: 'Végétarien',
            Slug: 'vegetarien',
            GroupId: 2,
            GroupName: 'Régimes alimentaires',
            GroupSlug: 'regimes-alimentaires',
            GroupSortOrder: 1
        } as TagRow), {
            id: 1,
            name: 'Végétarien',
            slug: 'vegetarien',
            group: {
                id: 2,
                name: 'Régimes alimentaires',
                slug: 'regimes-alimentaires',
                sortOrder: 1
            }
        });
    });
});
