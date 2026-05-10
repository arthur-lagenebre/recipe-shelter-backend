import { notFound } from '../../utils/errors.js';

import type { AdminCommentRepository } from '../../repositories/admin/admin.comments.repository.interface.js';
import type { AdminComment, AdminUpdateCommentInput } from '../../repositories/admin/admin.comments.types.js';

export class AdminCommentService {
    constructor(private readonly adminCommentRepository: AdminCommentRepository) { }

    async getModeratedCommentsForAdmin(): Promise<AdminComment[]> {
        return this.adminCommentRepository.findModeratedForAdmin();
    }

    async getCountModeratedCommentsForAdmin(): Promise<number> {
        return this.adminCommentRepository.countModeratedForAdmin();
    }

    async getSoftDeletedCommentsForAdmin(): Promise<AdminComment[]> {
        return this.adminCommentRepository.findSoftDeletedForAdmin();
    }

    async getCountSoftDeletedCommentsForAdmin(): Promise<number> {
        return this.adminCommentRepository.countSoftDeletedForAdmin();
    }

    async hide(commentId: number, adminUserId: number): Promise<boolean> {
        const comment = await this.adminCommentRepository.findByIdForAdmin(commentId);

        if (!comment)
            throw notFound('Comment not found', 'COMMENTS_NOT_FOUND');

        const hidden = await this.adminCommentRepository.hide(commentId, adminUserId);

        if (!hidden)
            throw notFound('Comment not found', 'COMMENTS_NOT_FOUND');

        return hidden;
    }

    async unmoderate(commentId: number): Promise<boolean> {
        const comment = await this.adminCommentRepository.findByIdForAdmin(commentId);

        if (!comment)
            throw notFound('Comment not found', 'COMMENTS_NOT_FOUND');

        const unmoderated = await this.adminCommentRepository.unmoderate(commentId);

        if (!unmoderated)
            throw notFound('Comment not found', 'COMMENTS_NOT_FOUND');

        return unmoderated;
    }

    async restore(commentId: number): Promise<boolean> {
        const comment = await this.adminCommentRepository.findByIdForAdmin(commentId);

        if (!comment)
            throw notFound('Comment not found', 'COMMENTS_NOT_FOUND');

        const restored = await this.adminCommentRepository.restore(commentId);

        if (!restored)
            throw notFound('Comment not found', 'COMMENTS_NOT_FOUND');

        return restored;
    }

    async update(input: AdminUpdateCommentInput): Promise<AdminComment> {
        const comment = await this.adminCommentRepository.update(input);

        if (!comment)
            throw notFound('Comment not found', 'COMMENTS_NOT_FOUND');

        return comment;
    }

    async hardDelete(commentId: number): Promise<boolean> {
        const deleted = await this.adminCommentRepository.delete(commentId);

        if (!deleted)
            throw notFound('Comment not found', 'COMMENTS_NOT_FOUND');

        return deleted;
    }
}
