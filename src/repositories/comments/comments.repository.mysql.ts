
import { mapComment, mapPublicComments } from './comments.mapper.js';
import { firstOrNull } from '../../utils/array.js';

import type { CommentRepository } from "./comments.repository.interface.js";
import type { Comment, CommentRow, CreateCommentInput, UpdateCommentInput } from "./comments.types.js";
import type { ResultSetHeader } from 'mysql2';
import type { Pool } from 'mysql2/promise';

export class CommentRepositoryMysql implements CommentRepository {
    constructor(private readonly db: Pool) { }

    async create(input: CreateCommentInput): Promise<Comment> {
        const [result] = await this.db.execute(
            `INSERT INTO Comments (RecipeId, UserId, ParentCommentId, ModeratedAt, ModeratedByUserId, Rating, Comment)
             VALUES (?, ?, ?, ?, ?, ?, ?);`,
            [input.recipeId, input.userId, input.parentCommentId ?? null, null, null, input.rating ?? null, input.comment]
        );

        const insertId = Number((result as { insertId: number }).insertId);
        const created = await this.findById(insertId);

        if (!created)
            throw new Error('Comment created but cannot be reloaded');

        return created;
    }

    async update(input: UpdateCommentInput): Promise<Comment | null> {
        const [result] = await this.db.execute<ResultSetHeader>(
            `UPDATE Comments
             SET Comment = ?, Rating = ?
             WHERE Id = ? AND UserId = ? AND DeletedAt IS NULL`,
            [input.comment, input.rating ?? null, input.id, input.userId]
        );

        if (result.affectedRows === 0)
            return null;

        const updated = await this.findById(input.id);

        if (!updated)
            throw new Error('Comment updated but cannot be reloaded');

        return updated;
    }

    async softDelete(id: number, userId: number): Promise<boolean> {
        const [result] = await this.db.execute<ResultSetHeader>(
            `UPDATE Comments
             SET DeletedAt = CURRENT_TIMESTAMP, DeletedByUserId = ?
             WHERE Id = ? AND UserId = ? AND DeletedAt IS NULL`,
            [userId, id, userId]
        );

        return result.affectedRows > 0;
    }

    async findById(id: number): Promise<Comment | null> {
        const [rows] = await this.db.execute(
            `SELECT Id, RecipeId, UserId, ParentCommentId, ModeratedAt, ModeratedByUserId, DeletedAt, DeletedByUserId, Rating, Comment, CreatedAt, UpdatedAt
             FROM Comments
             WHERE Id = ? AND DeletedAt IS NULL AND ModeratedAt IS NULL`,
            [id]
        );

        const row = firstOrNull(rows as CommentRow[]);
        return row ? mapComment(row) : null;
    }

    async findByRecipeId(recipeid: number): Promise<Comment[]> {
        const [rows] = await this.db.execute(
            `SELECT Id, RecipeId, UserId, ParentCommentId, ModeratedAt, ModeratedByUserId, DeletedAt, DeletedByUserId, Rating, Comment, CreatedAt, UpdatedAt
             FROM Comments
             WHERE RecipeId = ?
             ORDER BY COALESCE(ParentCommentId, Id), ParentCommentId IS NOT NULL, CreatedAt`,
            [recipeid]
        );

        return mapPublicComments(rows as CommentRow[]);
    }

}
