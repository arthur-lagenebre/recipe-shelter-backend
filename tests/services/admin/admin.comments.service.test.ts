import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { AdminCommentService } from '../../../src/services/admin/admin.comments.services.js';
import { HttpError } from '../../../src/utils/errors.js';
import { TestAdminAuditRecorder, testAdminAuditContext } from '../../helpers/admin-audit.js';

import type { AdminCommentRepository } from '../../../src/repositories/admin/admin.comments.repository.interface.js';
import type { AdminComment, AdminUpdateCommentInput } from '../../../src/repositories/admin/admin.comments.types.js';

const baseComment: AdminComment = {
    id: 1,
    recipeId: 10,
    recipeTitle: 'Cake marbre maison',
    recipeSlug: 'cake-marbre-maison',
    userId: 20,
    username: 'testuser',
    parentCommentId: null,
    moderatedAt: null,
    moderatedByUserId: null,
    moderatedByUsername: null,
    deletedAt: null,
    deletedByUserId: null,
    deletedByUsername: null,
    rating: 5,
    comment: 'Great recipe',
    createdAt: new Date('2026-05-09T10:00:00.000Z'),
    updatedAt: new Date('2026-05-09T10:00:00.000Z')
};

class FakeAdminCommentRepository implements AdminCommentRepository {
    comment: AdminComment | null = baseComment;
    hideResult = true;
    unmoderateResult = true;
    restoreResult = true;
    hardDeleteResult = true;
    moderatedByUserId: number | null = null;
    unmoderatedId: number | null = null;
    restoredId: number | null = null;
    updatedInput: AdminUpdateCommentInput | null = null;
    hardDeletedId: number | null = null;

    async findModeratedForAdmin(): Promise<AdminComment[]> {
        return this.comment ? [this.comment] : [];
    }

    async countModeratedForAdmin(): Promise<number> {
        return this.comment ? 1 : 0;
    }

    async findSoftDeletedForAdmin(): Promise<AdminComment[]> {
        return this.comment ? [{ ...this.comment, deletedAt: new Date('2026-05-09T11:00:00.000Z') }] : [];
    }

    async countSoftDeletedForAdmin(): Promise<number> {
        return this.comment ? 1 : 0;
    }

    async findByIdForAdmin(): Promise<AdminComment | null> {
        return this.comment;
    }

    async hide(id: number, moderatedByUserId: number): Promise<boolean> {
        void id;
        this.moderatedByUserId = moderatedByUserId;

        return this.hideResult;
    }

    async unmoderate(id: number): Promise<boolean> {
        this.unmoderatedId = id;

        return this.unmoderateResult;
    }

    async restore(id: number): Promise<boolean> {
        this.restoredId = id;

        return this.restoreResult;
    }

    async update(input: AdminUpdateCommentInput): Promise<AdminComment | null> {
        this.updatedInput = input;

        if (!this.comment)
            return null;

        return { ...this.comment, ...input };
    }

    async delete(id: number): Promise<boolean> {
        this.hardDeletedId = id;

        return this.hardDeleteResult;
    }
}

function assertHttpError(error: unknown, code: string, status: number): void {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
}

describe('AdminCommentService', () => {
    let repository: FakeAdminCommentRepository;
    let audit: TestAdminAuditRecorder;
    let service: AdminCommentService;

    beforeEach(() => {
        repository = new FakeAdminCommentRepository();
        audit = new TestAdminAuditRecorder();
        service = new AdminCommentService(repository, audit);
    });

    it('lists moderated comments', async () => {
        const result = await service.getModeratedCommentsForAdmin();

        assert.equal(result.length, 1);
        assert.equal(result[0]?.id, 1);
    });

    it('counts moderated comments', async () => {
        const result = await service.getCountModeratedCommentsForAdmin();

        assert.equal(result, 1);
    });

    it('lists soft deleted comments', async () => {
        const result = await service.getSoftDeletedCommentsForAdmin();

        assert.equal(result.length, 1);
        assert.ok(result[0]?.deletedAt);
    });

    it('counts soft deleted comments', async () => {
        const result = await service.getCountSoftDeletedCommentsForAdmin();

        assert.equal(result, 1);
    });

    it('hides an existing comment', async () => {
        const result = await service.hide(1, 99, testAdminAuditContext);

        assert.equal(result, true);
        assert.equal(repository.moderatedByUserId, 99);
        assert.equal(audit.inputs.length, 1);
        assert.deepEqual(audit.inputs[0], {
            actorUserId: 99,
            eventType: 'comments.hide',
            targetType: 'comment',
            targetId: 1,
            beforeValues: snapshotBaseComment(),
            afterValues: {
                ...snapshotBaseComment(),
                isModerated: true,
                moderatedByUserId: 99
            },
            ...testAdminAuditContext
        });
    });

    it('rejects hide when comment does not exist', async () => {
        repository.comment = null;

        await assert.rejects(
            () => service.hide(1, 99, testAdminAuditContext),
            (error) => {
                assertHttpError(error, 'COMMENTS_NOT_FOUND', 404);

                return true;
            }
        );
        assert.equal(repository.moderatedByUserId, null);
        assert.equal(audit.inputs.length, 0);
    });

    it('rejects hide when repository cannot update the comment', async () => {
        repository.hideResult = false;

        await assert.rejects(
            () => service.hide(1, 99, testAdminAuditContext),
            (error) => {
                assertHttpError(error, 'COMMENTS_NOT_FOUND', 404);

                return true;
            }
        );
        assert.equal(repository.moderatedByUserId, 99);
        assert.equal(audit.inputs.length, 0);
    });

    it('removes moderation from an existing comment', async () => {
        repository.comment = { ...baseComment, moderatedAt: new Date('2026-05-09T11:00:00.000Z'), moderatedByUserId: 99 };
        const result = await service.unmoderate(1, 99, testAdminAuditContext);

        assert.equal(result, true);
        assert.equal(repository.unmoderatedId, 1);
        assert.equal(audit.inputs.length, 1);
        assert.equal(audit.inputs[0]?.eventType, 'comments.unmoderate');
    });

    it('rejects unmoderate when comment does not exist', async () => {
        repository.comment = null;

        await assert.rejects(
            () => service.unmoderate(1, 99, testAdminAuditContext),
            (error) => {
                assertHttpError(error, 'COMMENTS_NOT_FOUND', 404);

                return true;
            }
        );
        assert.equal(repository.unmoderatedId, null);
        assert.equal(audit.inputs.length, 0);
    });

    it('rejects unmoderate when repository cannot update the comment', async () => {
        repository.unmoderateResult = false;

        await assert.rejects(
            () => service.unmoderate(1, 99, testAdminAuditContext),
            (error) => {
                assertHttpError(error, 'COMMENTS_NOT_FOUND', 404);

                return true;
            }
        );
        assert.equal(repository.unmoderatedId, 1);
        assert.equal(audit.inputs.length, 0);
    });

    it('restores and audits a soft deleted comment', async () => {
        repository.comment = { ...baseComment, deletedAt: new Date('2026-05-09T11:00:00.000Z'), deletedByUserId: 20 };
        const result = await service.restore(1, 99, testAdminAuditContext);

        assert.equal(result, true);
        assert.equal(repository.restoredId, 1);
        assert.equal(audit.inputs.length, 1);
        assert.deepEqual(audit.inputs[0], {
            actorUserId: 99,
            eventType: 'comments.restore',
            targetType: 'comment',
            targetId: 1,
            beforeValues: {
                ...snapshotBaseComment(),
                isDeleted: true,
                deletedByUserId: 20
            },
            afterValues: snapshotBaseComment(),
            ...testAdminAuditContext
        });
    });

    it('rejects restore when comment does not exist', async () => {
        repository.comment = null;

        await assert.rejects(
            () => service.restore(1, 99, testAdminAuditContext),
            (error) => {
                assertHttpError(error, 'COMMENTS_NOT_FOUND', 404);

                return true;
            }
        );
        assert.equal(repository.restoredId, null);
        assert.equal(audit.inputs.length, 0);
    });

    it('rejects restore when repository cannot update the comment', async () => {
        repository.restoreResult = false;

        await assert.rejects(
            () => service.restore(1, 99, testAdminAuditContext),
            (error) => {
                assertHttpError(error, 'COMMENTS_NOT_FOUND', 404);

                return true;
            }
        );
        assert.equal(repository.restoredId, 1);
        assert.equal(audit.inputs.length, 0);
    });

    it('updates a comment as admin', async () => {
        const input: AdminUpdateCommentInput = {
            id: 1,
            rating: null,
            comment: 'Commentaire corrige'
        };

        const result = await service.update(input, 99, testAdminAuditContext);

        assert.deepEqual(repository.updatedInput, input);
        assert.equal(result.comment, 'Commentaire corrige');
        assert.equal(result.rating, null);
        assert.equal(audit.inputs.length, 1);
        assert.equal(audit.inputs[0]?.eventType, 'comments.update');
    });

    it('rejects update when comment does not exist', async () => {
        repository.comment = null;

        await assert.rejects(
            () => service.update({
                id: 1,
                rating: 4,
                comment: 'Missing'
            }, 99, testAdminAuditContext),
            (error) => {
                assertHttpError(error, 'COMMENTS_NOT_FOUND', 404);

                return true;
            }
        );
        assert.equal(audit.inputs.length, 0);
    });

    it('hard deletes a comment as admin', async () => {
        const result = await service.hardDelete(1, 99, testAdminAuditContext);

        assert.equal(result, true);
        assert.equal(repository.hardDeletedId, 1);
        assert.equal(audit.inputs.length, 1);
        assert.equal(audit.inputs[0]?.eventType, 'comments.delete');
    });

    it('rejects hard delete when comment does not exist', async () => {
        repository.hardDeleteResult = false;

        await assert.rejects(
            () => service.hardDelete(1, 99, testAdminAuditContext),
            (error) => {
                assertHttpError(error, 'COMMENTS_NOT_FOUND', 404);

                return true;
            }
        );
        assert.equal(repository.hardDeletedId, 1);
        assert.equal(audit.inputs.length, 0);
    });

    it('propagates audit failures after the sensitive mutation', async () => {
        audit.error = new Error('audit unavailable');

        await assert.rejects(() => service.hide(1, 99, testAdminAuditContext), /audit unavailable/);
        assert.equal(repository.moderatedByUserId, 99);
        assert.equal(audit.inputs.length, 0);
    });
});

function snapshotBaseComment() {
    return {
        recipeId: baseComment.recipeId,
        userId: baseComment.userId,
        parentCommentId: baseComment.parentCommentId,
        rating: baseComment.rating,
        comment: baseComment.comment,
        isModerated: false,
        moderatedByUserId: null,
        isDeleted: false,
        deletedByUserId: null
    };
}
