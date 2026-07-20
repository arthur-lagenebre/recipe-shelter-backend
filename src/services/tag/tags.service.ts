import { notFound } from '../../utils/errors.js';

import type { TagRepository } from '../../repositories/tag/tag.repository.interface.js';
import type { Tag } from '../../repositories/tag/tag.types.js';

const tagNameTransliterations: ReadonlyArray<readonly [RegExp, string]> = [
    [/æ/g, 'ae'],
    [/œ/g, 'oe'],
    [/ß/g, 'ss'],
    [/ø/g, 'o'],
    [/[ðđ]/g, 'd'],
    [/ł/g, 'l']
];

export function normalizeTagName(name: string): string {
    let normalizedName = name
        .normalize('NFKD')
        .toLowerCase()
        .replace(/\p{M}+/gu, '');

    for (const [characters, replacement] of tagNameTransliterations)
        normalizedName = normalizedName.replace(characters, replacement);

    return normalizedName
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
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
