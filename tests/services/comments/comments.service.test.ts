import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { CommentService } from '../../../src/services/comments/comments.service.js';
import { HttpError } from '../../../src/utils/errors.js';

import type { CommentRepository } from '../../../src/repositories/comment/comment.repository.interface.js';
import type { Comment, CreateCommentInput, PublicComment, UpdateCommentInput } from '../../../src/repositories/comment/comment.types.js';

const baseComment: Comment = {
    id: 1,
    recipeId: 10,
    userId: 20,
    parentCommentId: null,
    moderatedAt: null,
    moderatedByUserId: null,
    deletedAt: null,
    deletedByUserId: null,
    rating: 5,
    comment: 'Great recipe',
    createdAt: new Date('2026-05-09T10:00:00.000Z'),
    updatedAt: new Date('2026-05-09T10:00:00.000Z')
};

const basePublicComment: PublicComment = {
    id: 1,
    recipeId: 10,
    author: {
        id: 20,
        username: 'testuser'
    },
    parentCommentId: null,
    moderatedAt: null,
    deletedAt: null,
    rating: 5,
    comment: 'Great recipe',
    createdAt: new Date('2026-05-09T10:00:00.000Z'),
    updatedAt: new Date('2026-05-09T10:00:00.000Z')
};

class FakeCommentRepository implements CommentRepository {
    createdInput: CreateCommentInput | null = null;
    updatedInput: UpdateCommentInput | null = null;
    deletedInput: { id: number; userId: number } | null = null;
    comment: Comment | null = baseComment;
    createResult: PublicComment | null = basePublicComment;
    commentsForRecipe: PublicComment[] | null = [basePublicComment];

    async create(input: CreateCommentInput): Promise<PublicComment> {
        this.createdInput = input;

        if (this.createResult === null) return null as never;

        return {
            ...basePublicComment,
            id: 2,
            recipeId: input.recipeId,
            author: {
                ...basePublicComment.author,
                id: input.userId
            },
            parentCommentId: input.parentCommentId ?? null,
            rating: input.rating ?? null,
            comment: input.comment
        };
    }

    async update(input: UpdateCommentInput): Promise<PublicComment | null> {
        this.updatedInput = input;

        if (this.comment?.userId !== input.userId) return null;

        return {
            ...basePublicComment,
            id: input.id,
            author: {
                ...basePublicComment.author,
                id: input.userId
            },
            rating: input.rating ?? null,
            comment: input.comment
        };
    }

    async findById(): Promise<Comment | null> {
        return this.comment;
    }

    async softDelete(id: number, userId: number): Promise<boolean> {
        this.deletedInput = { id, userId };

        return this.comment?.userId === userId;
    }

    async findByRecipeId(): Promise<PublicComment[]> {
        return this.commentsForRecipe as never;
    }
}

function assertHttpError(error: unknown, code: string, status: number): void {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
}

describe('CommentService', () => {
    let repository: FakeCommentRepository;
    let service: CommentService;

    beforeEach(() => {
        repository = new FakeCommentRepository();
        service = new CommentService(repository);
    });

    it('creates a comment through the repository', async () => {
        const input: CreateCommentInput = {
            recipeId: 10,
            userId: 20,
            parentCommentId: null,
            rating: 5,
            comment: 'Great recipe'
        };

        const result = await service.createComment(input);

        assert.deepEqual(repository.createdInput, input);
        assert.equal(result.id, 2);
        assert.deepEqual(result.author, { id: 20, username: 'testuser' });
        assert.equal('userId' in result, false);
        assert.equal(result.comment, input.comment);
    });

    it('creates a reply to a root comment', async () => {
        const input: CreateCommentInput = {
            recipeId: 10,
            userId: 20,
            parentCommentId: 1,
            comment: 'Thanks'
        };

        const result = await service.createComment(input);

        assert.deepEqual(repository.createdInput, input);
        assert.equal(result.parentCommentId, 1);
    });

    it('rejects a reply to a reply', async () => {
        repository.comment = { ...baseComment, parentCommentId: 99 };

        await assert.rejects(
            () =>
                service.createComment({
                    recipeId: 10,
                    userId: 20,
                    parentCommentId: 1,
                    comment: 'Nested reply'
                }),
            (error) => {
                assertHttpError(error, 'COMMENTS_CREATE_NESTED_REPLY', 400);

                return true;
            }
        );
        assert.equal(repository.createdInput, null);
    });

    it('rejects creation when the parent comment does not exist or creation fails', async () => {
        repository.comment = null;

        await assert.rejects(
            () =>
                service.createComment({
                    recipeId: 10,
                    userId: 20,
                    parentCommentId: 1,
                    comment: 'Missing parent'
                }),
            (error) => {
                assertHttpError(error, 'COMMENTS_PARENT_NOT_FOUND', 404);
                return true;
            }
        );

        repository.comment = baseComment;
        repository.createResult = null;

        await assert.rejects(
            () =>
                service.createComment({
                    recipeId: 10,
                    userId: 20,
                    comment: 'Create fails'
                }),
            (error) => {
                assertHttpError(error, 'COMMENT_CANNOT_BE_CREATED', 500);
                return true;
            }
        );
    });

    it('updates an owned comment', async () => {
        const input: UpdateCommentInput = {
            id: 1,
            userId: 20,
            rating: 4,
            comment: 'Still great'
        };

        const result = await service.updateComment(input);

        assert.deepEqual(repository.updatedInput, input);
        assert.equal(result.rating, 4);
        assert.equal(result.comment, 'Still great');
    });

    it('rejects update when comment does not exist', async () => {
        repository.comment = null;

        await assert.rejects(
            () =>
                service.updateComment({
                    id: 99,
                    userId: 20,
                    rating: 4,
                    comment: 'Missing'
                }),
            (error) => {
                assertHttpError(error, 'COMMENT_NOT_FOUND', 404);

                return true;
            }
        );
    });

    it('rejects update when the user does not own the comment', async () => {
        await assert.rejects(
            () =>
                service.updateComment({
                    id: 1,
                    userId: 99,
                    rating: 4,
                    comment: 'Not mine'
                }),
            (error) => {
                assertHttpError(error, 'COMMENT_ACCESS_DENIED', 403);

                return true;
            }
        );
        assert.equal(repository.updatedInput, null);
    });

    it('soft deletes an owned comment', async () => {
        const result = await service.deleteComment(1, 20);

        assert.equal(result, true);
        assert.deepEqual(repository.deletedInput, { id: 1, userId: 20 });
    });

    it('rejects delete when comment does not exist', async () => {
        repository.comment = null;

        await assert.rejects(
            () => service.deleteComment(99, 20),
            (error) => {
                assertHttpError(error, 'COMMENT_NOT_FOUND', 404);

                return true;
            }
        );
        assert.equal(repository.deletedInput, null);
    });

    it('rejects delete when the user does not own the comment', async () => {
        await assert.rejects(
            () => service.deleteComment(1, 99),
            (error) => {
                assertHttpError(error, 'COMMENT_ACCESS_DENIED', 403);

                return true;
            }
        );
        assert.equal(repository.deletedInput, null);
    });

    it('finds comments for a recipe and rejects missing repository results', async () => {
        assert.deepEqual(await service.findCommentsForRecipe(10), [basePublicComment]);

        repository.commentsForRecipe = null;
        await assert.rejects(
            () => service.findCommentsForRecipe(10),
            (error) => {
                assertHttpError(error, 'COMMENTS_NOT_FOUND', 404);
                return true;
            }
        );
    });
});
