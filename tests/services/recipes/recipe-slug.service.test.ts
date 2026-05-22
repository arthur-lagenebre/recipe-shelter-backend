import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RecipeSlugService } from '../../../src/services/recipes/recipe-slug.service.js';

import type { RecipeRepository } from '../../../src/repositories/recipes/recipe.repository.interface.js';

describe('RecipeSlugService', () => {
    it('creates draft slugs with the user id', async () => {
        const service = new RecipeSlugService({ existsBySlug: async () => false } as unknown as RecipeRepository);

        assert.match(await service.createDraftSlug(42), /^draft_42_\d+_[a-z0-9]{6}$/);
    });

    it('slugifies titles and finds a unique public slug', async () => {
        const checkedSlugs: string[] = [];
        const service = new RecipeSlugService({
            existsBySlug: async (slug: string) => {
                checkedSlugs.push(slug);
                return slug === 'creme-brulee' || slug === 'creme-brulee-2';
            }
        } as unknown as RecipeRepository);

        assert.equal(await service.createPublicSlug(' Crème brûlée! '), 'creme-brulee-3');
        assert.deepEqual(checkedSlugs, ['creme-brulee', 'creme-brulee-2', 'creme-brulee-3']);
    });

    it('falls back to recipe when a title has no slug characters', async () => {
        const service = new RecipeSlugService({ existsBySlug: async () => false } as unknown as RecipeRepository);

        assert.equal(await service.createPublicSlug('!!!'), 'recipe');
    });
});
