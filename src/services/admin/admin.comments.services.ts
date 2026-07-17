import { ADMIN_AUDIT_EVENT_TYPES, ADMIN_AUDIT_TARGET_TYPES } from './admin-audit.events.js';
import { notFound } from '../../utils/errors.js';

import type { AdminAuditActionRunner } from './admin-audit-action.runner.js';
import type { AdminAuditRequestContext } from './admin-audit.service.js';
import type { AdminCommentRepository } from '../../repositories/admin/admin.comments.repository.interface.js';
import type { AdminComment, AdminUpdateCommentInput } from '../../repositories/admin/admin.comments.types.js';

export class AdminCommentService {
    constructor(private readonly adminCommentRepository: AdminCommentRepository, private readonly auditActions: AdminAuditActionRunner) { }

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

    async hide(commentId: number, adminUserId: number, context: AdminAuditRequestContext): Promise<boolean> {
        return this.auditActions.run(async ({ db, audit }) => {
            const comment = await this.adminCommentRepository.findByIdForAdmin(commentId, db);

            if (!comment)
                throw notFound('Comment not found', 'COMMENTS_NOT_FOUND');

            const beforeValues = snapshotComment(comment);
            const hidden = await this.adminCommentRepository.hide(commentId, adminUserId, db);

            if (!hidden)
                throw notFound('Comment not found', 'COMMENTS_NOT_FOUND');

            await audit.record({
                actorUserId: adminUserId,
                eventType: ADMIN_AUDIT_EVENT_TYPES.commentsHide,
                targetType: ADMIN_AUDIT_TARGET_TYPES.comment,
                targetId: commentId,
                beforeValues,
                afterValues: {
                    ...beforeValues,
                    isModerated: true,
                    moderatedByUserId: adminUserId
                },
                ...context
            });

            return hidden;
        });
    }

    async unmoderate(commentId: number, adminUserId: number, context: AdminAuditRequestContext): Promise<boolean> {
        return this.auditActions.run(async ({ db, audit }) => {
            const comment = await this.adminCommentRepository.findByIdForAdmin(commentId, db);

            if (!comment)
                throw notFound('Comment not found', 'COMMENTS_NOT_FOUND');

            const beforeValues = snapshotComment(comment);
            const unmoderated = await this.adminCommentRepository.unmoderate(commentId, db);

            if (!unmoderated)
                throw notFound('Comment not found', 'COMMENTS_NOT_FOUND');

            await audit.record({
                actorUserId: adminUserId,
                eventType: ADMIN_AUDIT_EVENT_TYPES.commentsUnmoderate,
                targetType: ADMIN_AUDIT_TARGET_TYPES.comment,
                targetId: commentId,
                beforeValues,
                afterValues: {
                    ...beforeValues,
                    isModerated: false,
                    moderatedByUserId: null
                },
                ...context
            });

            return unmoderated;
        });
    }

    async restore(commentId: number, adminUserId: number, context: AdminAuditRequestContext): Promise<boolean> {
        return this.auditActions.run(async ({ db, audit }) => {
            const comment = await this.adminCommentRepository.findByIdForAdmin(commentId, db);

            if (!comment)
                throw notFound('Comment not found', 'COMMENTS_NOT_FOUND');

            const beforeValues = snapshotComment(comment);
            const restored = await this.adminCommentRepository.restore(commentId, db);

            if (!restored)
                throw notFound('Comment not found', 'COMMENTS_NOT_FOUND');

            await audit.record({
                actorUserId: adminUserId,
                eventType: ADMIN_AUDIT_EVENT_TYPES.commentsRestore,
                targetType: ADMIN_AUDIT_TARGET_TYPES.comment,
                targetId: commentId,
                beforeValues,
                afterValues: {
                    ...beforeValues,
                    isDeleted: false,
                    deletedByUserId: null
                },
                ...context
            });

            return restored;
        });
    }

    async update(input: AdminUpdateCommentInput, adminUserId: number, context: AdminAuditRequestContext): Promise<AdminComment> {
        return this.auditActions.run(async ({ db, audit }) => {
            const previousComment = await this.adminCommentRepository.findByIdForAdmin(input.id, db);

            if (!previousComment)
                throw notFound('Comment not found', 'COMMENTS_NOT_FOUND');

            const comment = await this.adminCommentRepository.update(input, db);

            if (!comment)
                throw notFound('Comment not found', 'COMMENTS_NOT_FOUND');

            await audit.record({
                actorUserId: adminUserId,
                eventType: ADMIN_AUDIT_EVENT_TYPES.commentsUpdate,
                targetType: ADMIN_AUDIT_TARGET_TYPES.comment,
                targetId: input.id,
                beforeValues: snapshotComment(previousComment),
                afterValues: snapshotComment(comment),
                ...context
            });

            return comment;
        });
    }

    async hardDelete(commentId: number, adminUserId: number, context: AdminAuditRequestContext): Promise<boolean> {
        return this.auditActions.run(async ({ db, audit }) => {
            const comment = await this.adminCommentRepository.findByIdForAdmin(commentId, db);

            if (!comment)
                throw notFound('Comment not found', 'COMMENTS_NOT_FOUND');

            const deleted = await this.adminCommentRepository.delete(commentId, db);

            if (!deleted)
                throw notFound('Comment not found', 'COMMENTS_NOT_FOUND');

            await audit.record({
                actorUserId: adminUserId,
                eventType: ADMIN_AUDIT_EVENT_TYPES.commentsDelete,
                targetType: ADMIN_AUDIT_TARGET_TYPES.comment,
                targetId: commentId,
                beforeValues: snapshotComment(comment),
                afterValues: null,
                ...context
            });

            return deleted;
        });
    }
}

function snapshotComment(comment: AdminComment) {
    return {
        recipeId: comment.recipeId,
        userId: comment.userId,
        parentCommentId: comment.parentCommentId,
        rating: comment.rating,
        comment: comment.comment,
        isModerated: comment.moderatedAt !== null,
        moderatedByUserId: comment.moderatedByUserId,
        isDeleted: comment.deletedAt !== null,
        deletedByUserId: comment.deletedByUserId
    };
}
