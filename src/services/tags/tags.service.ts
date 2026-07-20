import { notFound } from '../../utils/errors.js';
import { normalizeDisplayName } from '../../utils/string.js';

import type { TagRepository } from '../../repositories/tag/tag.repository.interface.js';
import type { Tag } from '../../repositories/tag/tag.types.js';

export function normalizeTagName(name: string): string {
    return normalizeDisplayName(name);
}

export class TagService {
    constructor(private readonly tagRepository: TagRepository) { }

    async getTags(): Promise<Tag[]> {
        const tags = await this.tagRepository.findAll();

        if (!tags)
            throw notFound('Tags not found', 'TAGS_NOT_FOUND');

        return tags;
    }

    async getTag(tagId: number): Promise<Tag> {
        const tag = await this.tagRepository.findById(tagId);

        if (!tag)
            throw notFound('Tag not found', 'TAG_NOT_FOUND');

        return tag;
    }
}
