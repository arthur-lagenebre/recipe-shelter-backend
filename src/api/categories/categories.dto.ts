import { badRequest } from '../../utils/errors.js';

export function parseCategoryIdParam(value: unknown): number {
    const categoryId = typeof value === 'string' ? Number(value) : NaN;

    if (!Number.isInteger(categoryId) || categoryId <= 0)
        throw badRequest('Category id must be a positive integer', 'CATEGORY_BAD_ID');

    return categoryId;
}
