import { parseAdminCommentIdParam, parseAdminUpdateCommentBody } from './admin.comments.dto.js';
import { asyncHandler } from '../http/async-handler.js';

import type { AdminCommentService } from '../../services/admin/admin.comments.services.js';

export function createAdminCommentsController(adminCommentService: AdminCommentService) {
    return {
        listModeratedComments: asyncHandler(async (_req, res) => {
            const comments = await adminCommentService.getModeratedCommentsForAdmin();

            res.status(200).json(comments);
        }),

        countModeratedComments: asyncHandler(async (_req, res) => {
            const count = await adminCommentService.getCountModeratedCommentsForAdmin();

            res.status(200).json({ moderatedComments: count });
        }),

        listSoftDeletedComments: asyncHandler(async (_req, res) => {
            const comments = await adminCommentService.getSoftDeletedCommentsForAdmin();

            res.status(200).json(comments);
        }),

        countSoftDeletedComments: asyncHandler(async (_req, res) => {
            const count = await adminCommentService.getCountSoftDeletedCommentsForAdmin();

            res.status(200).json({ softDeletedComments: count });
        }),

        hideComment: asyncHandler(async (req, res) => {
            const commentId = parseAdminCommentIdParam(req.params.id);
            const result = await adminCommentService.hide(commentId, req.auth!.userId);

            res.status(200).json({ ok: result });
        }),

        unmoderateComment: asyncHandler(async (req, res) => {
            const commentId = parseAdminCommentIdParam(req.params.id);
            const result = await adminCommentService.unmoderate(commentId);

            res.status(200).json({ ok: result });
        }),

        restoreComment: asyncHandler(async (req, res) => {
            const commentId = parseAdminCommentIdParam(req.params.id);
            const result = await adminCommentService.restore(commentId);

            res.status(200).json({ ok: result });
        }),

        updateComment: asyncHandler(async (req, res) => {
            const commentId = parseAdminCommentIdParam(req.params.id);
            const body = parseAdminUpdateCommentBody(req.body);
            const comment = await adminCommentService.update({ id: commentId, rating: body.rating, comment: body.comment });

            res.status(200).json(comment);
        }),

        deleteComment: asyncHandler(async (req, res) => {
            const commentId = parseAdminCommentIdParam(req.params.id);
            const result = await adminCommentService.hardDelete(commentId);

            res.status(200).json({ ok: result });
        })
    };
}
