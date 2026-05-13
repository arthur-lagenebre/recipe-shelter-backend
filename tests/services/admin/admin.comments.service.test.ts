import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { AdminCommentService } from '../../../src/services/admin/admin.comments.services.js';
import { HttpError } from '../../../src/utils/errors.js';

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
    let service: AdminCommentService;

    beforeEach(() => {
        repository = new FakeAdminCommentRepository();
        service = new AdminCommentService(repository);
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
        const result = await service.hide(1, 99);

        assert.equal(result, true);
        assert.equal(repository.moderatedByUserId, 99);
    });

    it('rejects hide when comment does not exist', async () => {
        repository.comment = null;

        await assert.rejects(
            () => service.hide(1, 99),
            (error) => {
                assertHttpError(error, 'COMMENTS_NOT_FOUND', 404);

                return true;
            }
        );
        assert.equal(repository.moderatedByUserId, null);
    });

    it('rejects hide when repository cannot update the comment', async () => {
        repository.hideResult = false;

        await assert.rejects(
            () => service.hide(1, 99),
            (error) => {
                assertHttpError(error, 'COMMENTS_NOT_FOUND', 404);

                return true;
            }
        );
        assert.equal(repository.moderatedByUserId, 99);
    });

    it('removes moderation from an existing comment', async () => {
        const result = await service.unmoderate(1);

        assert.equal(result, true);
        assert.equal(repository.unmoderatedId, 1);
    });

    it('rejects unmoderate when comment does not exist', async () => {
        repository.comment = null;

        await assert.rejects(
            () => service.unmoderate(1),
            (error) => {
                assertHttpError(error, 'COMMENTS_NOT_FOUND', 404);

                return true;
            }
        );
        assert.equal(repository.unmoderatedId, null);
    });

    it('rejects unmoderate when repository cannot update the comment', async () => {
        repository.unmoderateResult = false;

        await assert.rejects(
            () => service.unmoderate(1),
            (error) => {
                assertHttpError(error, 'COMMENTS_NOT_FOUND', 404);

                return true;
            }
        );
        assert.equal(repository.unmoderatedId, 1);
    });

    it('restores a soft deleted comment', async () => {
        const result = await service.restore(1);

        assert.equal(result, true);
        assert.equal(repository.restoredId, 1);
    });

    it('rejects restore when comment does not exist', async () => {
        repository.comment = null;

        await assert.rejects(
            () => service.restore(1),
            (error) => {
                assertHttpError(error, 'COMMENTS_NOT_FOUND', 404);

                return true;
            }
        );
        assert.equal(repository.restoredId, null);
    });

    it('rejects restore when repository cannot update the comment', async () => {
        repository.restoreResult = false;

        await assert.rejects(
            () => service.restore(1),
            (error) => {
                assertHttpError(error, 'COMMENTS_NOT_FOUND', 404);

                return true;
            }
        );
        assert.equal(repository.restoredId, 1);
    });

    it('updates a comment as admin', async () => {
        const input: AdminUpdateCommentInput = {
            id: 1,
            rating: null,
            comment: 'Commentaire corrige'
        };

        const result = await service.update(input);

        assert.deepEqual(repository.updatedInput, input);
        assert.equal(result.comment, 'Commentaire corrige');
        assert.equal(result.rating, null);
    });

    it('rejects update when comment does not exist', async () => {
        repository.comment = null;

        await assert.rejects(
            () => service.update({
                id: 1,
                rating: 4,
                comment: 'Missing'
            }),
            (error) => {
                assertHttpError(error, 'COMMENTS_NOT_FOUND', 404);

                return true;
            }
        );
    });

    it('hard deletes a comment as admin', async () => {
        const result = await service.hardDelete(1);

        assert.equal(result, true);
        assert.equal(repository.hardDeletedId, 1);
    });

    it('rejects hard delete when comment does not exist', async () => {
        repository.hardDeleteResult = false;

        await assert.rejects(
            () => service.hardDelete(1),
            (error) => {
                assertHttpError(error, 'COMMENTS_NOT_FOUND', 404);

                return true;
            }
        );
        assert.equal(repository.hardDeletedId, 1);
    });
});
