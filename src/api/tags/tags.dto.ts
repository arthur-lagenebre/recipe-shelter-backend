import { badRequest } from '../../utils/errors.js';

export function parseTagIdParam(value: unknown): number {
    const tagId = typeof value === 'string' ? Number(value) : NaN;

    if (!Number.isInteger(tagId) || tagId <= 0)
        throw badRequest('Tag id must be a positive integer', 'TAG_BAD_ID');

    return tagId;
}
