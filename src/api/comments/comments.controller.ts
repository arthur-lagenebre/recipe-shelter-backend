import { parseCommentIdParam, parseCreateCommentBody, parseRecipeIdParam, parseUpdateCommentBody } from './comments.dto.js';
import { asyncHandler } from '../http/async-handler.js';

import type { CommentService } from '../../services/comments/comments.service.js';

export function createCommentsController(commentService: CommentService) {
    return {
        createComment: asyncHandler(async (req, res) => {
            const recipeId = parseRecipeIdParam(req.params.recipeId);
            const body = parseCreateCommentBody(req.body);
            const comment = await commentService.createComment({
                recipeId,
                userId: req.auth!.userId,
                parentCommentId: body.parentCommentId,
                rating: body.rating,
                comment: body.comment
            });

            res.status(201).json(comment);
        }),

        updateComment: asyncHandler(async (req, res) => {
            const commentId = parseCommentIdParam(req.params.id);
            const body = parseUpdateCommentBody(req.body);
            const comment = await commentService.updateComment({
                id: commentId,
                userId: req.auth!.userId,
                rating: body.rating,
                comment: body.comment
            });

            res.status(200).json(comment);
        }),

        deleteComment: asyncHandler(async (req, res) => {
            const commentId = parseCommentIdParam(req.params.id);
            const result = await commentService.deleteComment(commentId, req.auth!.userId);

            res.status(200).json({ ok: result });
        }),

        getRecipeComments: asyncHandler(async (req, res) => {
            const recipeId = parseRecipeIdParam(req.params.recipeId);
            const comments = await commentService.findCommentsForRecipe(recipeId);

            res.status(200).json(comments);
        })
    };
}
