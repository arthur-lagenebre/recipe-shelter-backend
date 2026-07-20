import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapComment, mapPublicComment, mapPublicComments } from '../../../src/repositories/comment/comment.mapper.js';

import type { CommentRow, PublicCommentRow } from '../../../src/repositories/comment/comment.types.js';

const publicCommentRow = {
    Id: 1,
    RecipeId: 10,
    AuthorId: 20,
    AuthorUsername: 'testuser',
    ParentCommentId: null,
    ModeratedAt: null,
    DeletedAt: null,
    Rating: 5,
    Comment: 'Great recipe',
    CreatedAt: new Date('2026-05-09T10:00:00.000Z'),
    UpdatedAt: new Date('2026-05-09T10:00:00.000Z')
} as PublicCommentRow;

describe('comments.mapper', () => {
    it('maps private comment rows', () => {
        const result = mapComment({
            Id: 1,
            RecipeId: 10,
            UserId: 20,
            ParentCommentId: null,
            ModeratedAt: null,
            ModeratedByUserId: null,
            DeletedAt: null,
            DeletedByUserId: null,
            Rating: 5,
            Comment: 'Great recipe',
            CreatedAt: new Date('2026-05-09T10:00:00.000Z'),
            UpdatedAt: new Date('2026-05-09T10:00:00.000Z')
        } as CommentRow);

        assert.equal(result.id, 1);
        assert.equal(result.userId, 20);
        assert.equal(result.comment, 'Great recipe');
    });

    it('maps a public comment with a nested author only', () => {
        const result = mapPublicComment(publicCommentRow);

        assert.deepEqual(result.author, { id: 20, username: 'testuser' });
        assert.equal(Object.hasOwn(result, 'userId'), false);
        assert.equal(Object.hasOwn(result, 'username'), false);
        assert.equal(Object.hasOwn(result, 'moderatedByUserId'), false);
        assert.equal(Object.hasOwn(result, 'deletedByUserId'), false);
    });

    it('masks deleted and moderated public comments', () => {
        const deleted = mapPublicComment({ ...publicCommentRow, DeletedAt: new Date('2026-05-10T10:00:00.000Z'), Comment: 'Original' } as PublicCommentRow);
        const moderated = mapPublicComment({ ...publicCommentRow, ModeratedAt: new Date('2026-05-10T10:00:00.000Z'), Comment: 'Original' } as PublicCommentRow);

        assert.match(deleted.comment, /supprim/);
        assert.match(moderated.comment, /masqu/);
    });

    it('keeps author payloads when building a public comment tree', () => {
        const childRow = {
            ...publicCommentRow,
            Id: 2,
            AuthorId: 21,
            AuthorUsername: 'replyuser',
            ParentCommentId: 1,
            Rating: null,
            Comment: 'Thanks'
        } as PublicCommentRow;

        const result = mapPublicComments([publicCommentRow, childRow]);

        assert.equal(result.length, 1);
        assert.deepEqual(result[0]?.children?.[0]?.author, { id: 21, username: 'replyuser' });
    });
});
