import { parseCategoryIdParam } from './category.dto.js';
import { asyncHandler } from '../http/async-handler.js';

import type { CategoryService } from '../../services/category/category.service.js';

export function createCategoryController(categoryService: CategoryService) {
    return {
        getCategories: asyncHandler(async (req, res) => {
            const categories = await categoryService.getCategories();
            res.status(200).json(categories);
        }),

        getCategory: asyncHandler(async (req, res) => {
            const categoryId = parseCategoryIdParam(req.params.id);
            const category = await categoryService.getCategory(categoryId);
            res.status(200).json(category);
        })
    };
}