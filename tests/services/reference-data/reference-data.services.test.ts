import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CategoryService } from '../../../src/services/category/category.service.js';
import { EquipmentService } from '../../../src/services/equipments/equipments.service.js';
import { IngredientService } from '../../../src/services/ingredients/ingredients.service.js';
import { TagService } from '../../../src/services/tag/tags.service.js';
import { HttpError } from '../../../src/utils/errors.js';

import type { CategoryRepository } from '../../../src/repositories/category/category.repository.interface.js';
import type { Category } from '../../../src/repositories/category/category.types.js';
import type { EquipmentRepository } from '../../../src/repositories/equipments/equipment.repository.interface.js';
import type { Equipment } from '../../../src/repositories/equipments/equipment.types.js';
import type { IngredientRepository } from '../../../src/repositories/ingredients/ingredient.repository.interface.js';
import type { Ingredient } from '../../../src/repositories/ingredients/ingredient.types.js';
import type { TagRepository } from '../../../src/repositories/tag/tag.repository.interface.js';
import type { Tag } from '../../../src/repositories/tag/tag.types.js';

const category: Category = {
    id: 1,
    name: 'Desserts',
    slug: 'desserts',
    iconName: 'cake',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z')
};
const equipment: Equipment = { id: 2, name: 'Whisk', slug: 'whisk' };
const ingredient: Ingredient = { id: 3, name: 'Flour', slug: 'flour' };
const tag: Tag = {
    id: 4,
    name: 'Quick',
    normalizedName: 'quick',
    slug: 'quick',
    description: null,
    status: 'active',
    mergedIntoTagId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    group: { id: 1, name: 'Time', slug: 'time', sortOrder: 1 }
};

function assertNotFound(error: unknown, code: string): boolean {
    assert.ok(error instanceof HttpError);
    assert.equal(error.statusCode, 404);
    assert.equal(error.code, code);

    return true;
}

describe('reference data services', () => {
    it('returns categories and looks up a category by id', async () => {
        const requestedIds: number[] = [];
        const repository: CategoryRepository = {
            async findAll() { return [category]; },
            async findById(id) { requestedIds.push(id); return category; }
        };
        const service = new CategoryService(repository);

        assert.deepEqual(await service.getCategories(), [category]);
        assert.deepEqual(await service.getCategory(1), category);
        assert.deepEqual(requestedIds, [1]);
    });

    it('reports missing category data', async () => {
        const repository = {
            async findAll() { return null; },
            async findById() { return null; }
        } as unknown as CategoryRepository;
        const service = new CategoryService(repository);

        await assert.rejects(() => service.getCategories(), (error) => assertNotFound(error, 'CATEGORIES_NOT_FOUND'));
        await assert.rejects(() => service.getCategory(99), (error) => assertNotFound(error, 'CATEGORY_NOT_FOUND'));
    });

    it('returns equipments and reports missing equipment data', async () => {
        const repository: EquipmentRepository = {
            async findAll() { return [equipment]; },
            async findById(id) { return id === equipment.id ? equipment : null; }
        };
        const service = new EquipmentService(repository);

        assert.deepEqual(await service.getEquipments(), [equipment]);
        assert.deepEqual(await service.getEquipment(2), equipment);
        await assert.rejects(() => service.getEquipment(99), (error) => assertNotFound(error, 'EQUIPMENT_NOT_FOUND'));
    });

    it('returns ingredients and reports missing ingredient data', async () => {
        const repository: IngredientRepository = {
            async findAll() { return [ingredient]; },
            async findById(id) { return id === ingredient.id ? ingredient : null; }
        };
        const service = new IngredientService(repository);

        assert.deepEqual(await service.getIngredients(), [ingredient]);
        assert.deepEqual(await service.getIngredient(3), ingredient);
        await assert.rejects(() => service.getIngredient(99), (error) => assertNotFound(error, 'INGREDIENT_NOT_FOUND'));
    });

    it('returns tags and reports missing tag data', async () => {
        const repository: TagRepository = {
            async findAll() { return [tag]; },
            async findById(id) { return id === tag.id ? tag : null; }
        };
        const service = new TagService(repository);

        assert.deepEqual(await service.getTags(), [tag]);
        assert.deepEqual(await service.getTag(4), tag);
        await assert.rejects(() => service.getTag(99), (error) => assertNotFound(error, 'TAG_NOT_FOUND'));
    });

    it('accepts empty reference lists as valid results', async () => {
        const categories = new CategoryService({
            async findAll() { return []; },
            async findById() { return null; }
        });

        assert.deepEqual(await categories.getCategories(), []);
    });
});
