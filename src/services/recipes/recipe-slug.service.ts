import type { RecipeRepository } from '../../repositories/recipes/recipe.repository.interface.js';

export class RecipeSlugService {
    constructor(private readonly recipes: RecipeRepository) {}

    async createDraftSlug(userId: number): Promise<string> {
        const rand = Math.random().toString(36).slice(2, 8);

        return `draft_${userId}_${Date.now()}_${rand}`;
    }

    async createPublicSlug(title: string): Promise<string> {
        const baseSlug = slugify(title) || 'recipe';

        return this.createUniqueSlug(baseSlug);
    }

    private async createUniqueSlug(baseSlug: string): Promise<string> {
        let candidate = baseSlug;
        let suffix = 2;

        while (await this.recipes.existsBySlug(candidate)) {
            candidate = `${baseSlug}-${suffix}`;
            suffix += 1;
        }

        return candidate;
    }
}

function slugify(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
