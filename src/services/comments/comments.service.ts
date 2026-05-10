import { badRequest, forbidden, internalError, notFound } from '../../utils/errors.js';

import type { CommentRepository } from '../../repositories/comments/comments.repository.interface.js';
import type { Comment, CreateCommentInput, UpdateCommentInput } from '../../repositories/comments/comments.types.js';

export class CommentService {
    constructor(private readonly commentRepository: CommentRepository) { }

    async createComment(input: CreateCommentInput): Promise<Comment> {
        if (input.parentCommentId !== undefined && input.parentCommentId !== null)
            await this.requireRootParentComment(input.parentCommentId);

        const comment = await this.commentRepository.create(input);

        if (!comment)
            throw internalError('Comment cannot be created', 'COMMENT_CANNOT_BE_CREATED');

        return comment;
    }

    async updateComment(input: UpdateCommentInput): Promise<Comment> {
        const comment = await this.commentRepository.findById(input.id);

        if (!comment)
            throw notFound('Comment not found', 'COMMENT_NOT_FOUND');

        if (comment.userId !== input.userId)
            throw forbidden('Comment access denied', 'COMMENT_ACCESS_DENIED');

        const updated = await this.commentRepository.update(input);

        if (!updated)
            throw forbidden('Comment access denied', 'COMMENT_ACCESS_DENIED');

        return updated;
    }

    async deleteComment(id: number, userId: number): Promise<boolean> {
        const comment = await this.commentRepository.findById(id);

        if (!comment)
            throw notFound('Comment not found', 'COMMENT_NOT_FOUND');

        if (comment.userId !== userId)
            throw forbidden('Comment access denied', 'COMMENT_ACCESS_DENIED');

        return await this.commentRepository.softDelete(id, userId);
    }

    async findCommentsForRecipe(recipeid: number): Promise<Comment[]> {
        const comments = await this.commentRepository.findByRecipeId(recipeid);

        if (!comments)
            throw notFound('comments not found', 'COMMENTS_NOT_FOUND');

        return comments;
    }

    private async requireRootParentComment(parentCommentId: number): Promise<void> {
        const parent = await this.commentRepository.findById(parentCommentId);

        if (!parent)
            throw notFound('Parent comment not found', 'COMMENTS_PARENT_NOT_FOUND');

        if (parent.parentCommentId !== null && parent.parentCommentId !== undefined)
            throw badRequest('Only one reply level is allowed', 'COMMENTS_CREATE_NESTED_REPLY');
    }
}
