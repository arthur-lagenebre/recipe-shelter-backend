import { notFound } from '../../utils/errors.js';

import type { CategoryRepository } from '../../repositories/category/category.repository.interface.js';
import type { Category } from '../../repositories/category/category.types.js';

export class CategoryService {
    constructor(private readonly categoryRepository: CategoryRepository) {}

    async getCategories(): Promise<Category[]> {
        const categories = await this.categoryRepository.findAll();

        if (!categories)
            throw notFound('Categories not found', 'CATEGORIES_NOT_FOUND');

        return categories;
    }

    async getCategory(categoryId: number): Promise<Category> {
        const Category = await this.categoryRepository.findById(categoryId);

        if (!Category)
            throw notFound('Category not found', 'CATEGORY_NOT_FOUND');

        return Category;
    }
}
