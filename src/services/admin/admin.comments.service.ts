import { ADMIN_AUDIT_EVENT_TYPES, ADMIN_AUDIT_TARGET_TYPES } from './admin.audit.events.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';

import type { AdminAuditActionRunner } from './admin.audit-action.runner.js';
import type { AdminAuditRequestContext } from './admin.audit.service.js';
import type { AdminCommentRepository } from '../../repositories/admin/admin.comments.repository.interface.js';
import type { AdminComment, AdminUpdateCommentInput } from '../../repositories/admin/admin.comments.types.js';

const MODERATION_REASON_MIN_LENGTH = 10;
const MODERATION_REASON_MAX_LENGTH = 1000;

export class AdminCommentService {
    constructor(
        private readonly adminCommentRepository: AdminCommentRepository,
        private readonly auditActions: AdminAuditActionRunner
    ) {}

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

    async hide(commentId: number, adminUserId: number, reason: string, context: AdminAuditRequestContext): Promise<boolean> {
        const cleanReason = validateHideReason(reason);

        return this.auditActions.run(async ({ db, audit }) => {
            const comment = await this.adminCommentRepository.findByIdForAdmin(commentId, db);

            if (!comment)
                throw notFound('Comment not found', 'COMMENTS_NOT_FOUND');

            const beforeValues = snapshotComment(comment);
            const hidden = await this.adminCommentRepository.hide(commentId, adminUserId, cleanReason, db);

            if (!hidden)
                throw notFound('Comment not found', 'COMMENTS_NOT_FOUND');

            const auditReceipt = await audit.record({
                actorUserId: adminUserId,
                eventType: ADMIN_AUDIT_EVENT_TYPES.commentsHide,
                targetType: ADMIN_AUDIT_TARGET_TYPES.comment,
                targetId: commentId,
                reason: cleanReason,
                beforeValues,
                afterValues: {
                    ...beforeValues,
                    isModerated: true,
                    moderatedByUserId: adminUserId,
                    moderationReason: cleanReason
                },
                ...context
            });
            await this.adminCommentRepository.createModerationLog(auditReceipt.id, commentId, db);

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
                    moderatedByUserId: null,
                    moderationReason: null
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

            const replyCount = await this.adminCommentRepository.countReplies(commentId, db);

            if (replyCount > 0)
                throw conflict(
                    'This comment has replies and cannot be permanently deleted; delete its replies first',
                    'ADMIN_COMMENTS_DELETE_HAS_REPLIES'
                );

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
        moderationReason: comment.moderationReason,
        isDeleted: comment.deletedAt !== null,
        deletedByUserId: comment.deletedByUserId
    };
}

function validateHideReason(reason: string): string {
    const cleanReason = typeof reason === 'string' ? reason.trim() : '';

    if (!cleanReason)
        throw badRequest('Hide reason is required', 'ADMIN_COMMENTS_HIDE_MISSING_REASON');
    if (cleanReason.length < MODERATION_REASON_MIN_LENGTH)
        throw badRequest(`Hide reason must be at least ${MODERATION_REASON_MIN_LENGTH} characters`, 'ADMIN_COMMENTS_HIDE_REASON_TOO_SHORT');
    if (cleanReason.length > MODERATION_REASON_MAX_LENGTH)
        throw badRequest(`Hide reason must be at most ${MODERATION_REASON_MAX_LENGTH} characters`, 'ADMIN_COMMENTS_HIDE_REASON_TOO_LONG');

    return cleanReason;
}
