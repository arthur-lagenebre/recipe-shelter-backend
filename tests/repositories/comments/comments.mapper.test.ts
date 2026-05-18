import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapPublicComment, mapPublicComments } from '../../../src/repositories/comments/comments.mapper.js';

import type { PublicCommentRow } from '../../../src/repositories/comments/comments.types.js';

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
    it('maps a public comment with a nested author only', () => {
        const result = mapPublicComment(publicCommentRow);

        assert.deepEqual(result.author, { id: 20, username: 'testuser' });
        assert.equal(Object.hasOwn(result, 'userId'), false);
        assert.equal(Object.hasOwn(result, 'username'), false);
        assert.equal(Object.hasOwn(result, 'moderatedByUserId'), false);
        assert.equal(Object.hasOwn(result, 'deletedByUserId'), false);
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
