import { parseTagIdParam } from './tags.dto.js';
import { asyncHandler } from '../http/async-handler.js';

import type { TagService } from '../../services/tags/tags.service.js';

export function createTagsController(tagService: TagService) {
    return {
        getTags: asyncHandler(async (req, res) => {
            const tags = await tagService.getTags();
            res.status(200).json(tags);
        }),

        getTag: asyncHandler(async (req, res) => {
            const tagId = parseTagIdParam(req.params.id);
            const profile = await tagService.getTag(tagId);
            res.status(200).json(profile);
        })
    };
}