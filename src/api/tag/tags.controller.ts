import { parseTagIdParam } from './tags.dto.js';
import { asyncHandler } from '../http/async-handler.js';

import type { TagService } from '../../services/tag/tags.service.js';

export function createTagsController(tagService: TagService) {
    return {
        getTags: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }

            const tags = await tagService.getTags();
            res.status(200).json(tags);
        }),

        getTag: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }
            
            const tagId = parseTagIdParam(req.params.id);
            const profile = await tagService.getTag(tagId);
            res.status(200).json(profile);
        })
    };
}