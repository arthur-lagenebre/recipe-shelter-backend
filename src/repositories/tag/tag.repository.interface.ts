import type { Tag } from './tag.types.js';

export interface TagRepository {
    findAll(): Promise<Tag[]>;
    findById(id: number): Promise<Tag | null>;
}
