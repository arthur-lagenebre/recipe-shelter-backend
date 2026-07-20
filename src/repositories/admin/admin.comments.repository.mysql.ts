import { mapAdminComment } from './admin.comments.mapper.js';
import { firstOrNull } from '../../utils/array.js';

import type { AdminCommentRepository } from './admin.comments.repository.interface.js';
import type { AdminComment, AdminCommentRow, AdminUpdateCommentInput } from './admin.comments.types.js';
import type { ResultSetHeader } from 'mysql2';
import type { Pool, PoolConnection } from 'mysql2/promise';

export class AdminCommentRepositoryMysql implements AdminCommentRepository {
    constructor(private readonly db: Pool) { }

    async findModeratedForAdmin(): Promise<AdminComment[]> {
        const [rows] = await this.db.execute(
            `SELECT c.Id, c.RecipeId, r.Title AS RecipeTitle, r.Slug AS RecipeSlug, c.UserId, u.Username, c.ParentCommentId, c.ModeratedAt, c.ModeratedByUserId, moderator.Username AS ModeratedByUsername, c.ModerationReason, c.DeletedAt, c.DeletedByUserId, deletedBy.Username AS DeletedByUsername, c.Rating, c.Comment, c.CreatedAt, c.UpdatedAt
             FROM Comments AS c
             INNER JOIN Recipes AS r ON c.RecipeId = r.Id
             INNER JOIN Users AS u ON c.UserId = u.Id
             LEFT JOIN Users AS moderator ON c.ModeratedByUserId = moderator.Id
             LEFT JOIN Users AS deletedBy ON c.DeletedByUserId = deletedBy.Id
             WHERE c.ModeratedAt IS NOT NULL
             ORDER BY c.ModeratedAt DESC, c.Id DESC`
        );

        return (rows as AdminCommentRow[]).map(mapAdminComment);
    }

    async countModeratedForAdmin(): Promise<number> {
        const [rows] = await this.db.execute(
            `SELECT COUNT(*) AS Count
             FROM Comments
             WHERE ModeratedAt IS NOT NULL`
        );

        const row = firstOrNull(rows as { Count: number }[]);
        return row?.Count ?? 0;
    }

    async findSoftDeletedForAdmin(): Promise<AdminComment[]> {
        const [rows] = await this.db.execute(
            `SELECT c.Id, c.RecipeId, r.Title AS RecipeTitle, r.Slug AS RecipeSlug, c.UserId, u.Username, c.ParentCommentId, c.ModeratedAt, c.ModeratedByUserId, moderator.Username AS ModeratedByUsername, c.ModerationReason, c.DeletedAt, c.DeletedByUserId, deletedBy.Username AS DeletedByUsername, c.Rating, c.Comment, c.CreatedAt, c.UpdatedAt
             FROM Comments AS c
             INNER JOIN Recipes AS r ON c.RecipeId = r.Id
             INNER JOIN Users AS u ON c.UserId = u.Id
             LEFT JOIN Users AS moderator ON c.ModeratedByUserId = moderator.Id
             LEFT JOIN Users AS deletedBy ON c.DeletedByUserId = deletedBy.Id
             WHERE c.DeletedAt IS NOT NULL
             ORDER BY c.DeletedAt DESC, c.Id DESC`
        );

        return (rows as AdminCommentRow[]).map(mapAdminComment);
    }

    async countSoftDeletedForAdmin(): Promise<number> {
        const [rows] = await this.db.execute(
            `SELECT COUNT(*) AS Count
             FROM Comments
             WHERE DeletedAt IS NOT NULL`
        );

        const row = firstOrNull(rows as { Count: number }[]);
        return row?.Count ?? 0;
    }

    async findByIdForAdmin(id: number, db?: PoolConnection): Promise<AdminComment | null> {
        const [rows] = await (db ?? this.db).execute(
            `SELECT c.Id, c.RecipeId, r.Title AS RecipeTitle, r.Slug AS RecipeSlug, c.UserId, u.Username, c.ParentCommentId, c.ModeratedAt, c.ModeratedByUserId, moderator.Username AS ModeratedByUsername, c.ModerationReason, c.DeletedAt, c.DeletedByUserId, deletedBy.Username AS DeletedByUsername, c.Rating, c.Comment, c.CreatedAt, c.UpdatedAt
             FROM Comments AS c
             INNER JOIN Recipes AS r ON c.RecipeId = r.Id
             INNER JOIN Users AS u ON c.UserId = u.Id
             LEFT JOIN Users AS moderator ON c.ModeratedByUserId = moderator.Id
             LEFT JOIN Users AS deletedBy ON c.DeletedByUserId = deletedBy.Id
             WHERE c.Id = ?
             ${db ? 'FOR UPDATE' : ''}`,
            [id]
        );

        const row = firstOrNull(rows as AdminCommentRow[]);
        return row ? mapAdminComment(row) : null;
    }

    async hide(id: number, moderatedByUserId: number, moderationReason: string, db?: PoolConnection): Promise<boolean> {
        const [result] = await (db ?? this.db).execute<ResultSetHeader>(
            `UPDATE Comments
             SET ModeratedAt = CURRENT_TIMESTAMP, ModeratedByUserId = ?, ModerationReason = ?
             WHERE Id = ?`,
            [moderatedByUserId, moderationReason, id]
        );

        return result.affectedRows > 0;
    }

    async createModerationLog(auditLogId: number, commentId: number, db: PoolConnection): Promise<void> {
        const [result] = await db.execute<ResultSetHeader>(
            `INSERT INTO CommentModerationLogs (AdminAuditLogId, CommentId)
             SELECT audit.Id, ?
             FROM AdminAuditLogs AS audit
             WHERE audit.Id = ?
               AND audit.Action = 'comments.hide'
               AND audit.TargetType = 'comment'
               AND audit.Reason IS NOT NULL
               AND BINARY audit.TargetId = BINARY CAST(? AS CHAR)`,
            [commentId, auditLogId, commentId]
        );

        if (result.affectedRows !== 1)
            throw new Error('Comment moderation log does not match its administrative audit entry');
    }

    async unmoderate(id: number, db?: PoolConnection): Promise<boolean> {
        const [result] = await (db ?? this.db).execute<ResultSetHeader>(
            `UPDATE Comments
             SET ModeratedAt = NULL, ModeratedByUserId = NULL, ModerationReason = NULL
             WHERE Id = ? AND ModeratedAt IS NOT NULL`,
            [id]
        );

        return result.affectedRows > 0;
    }

    async restore(id: number, db?: PoolConnection): Promise<boolean> {
        const [result] = await (db ?? this.db).execute<ResultSetHeader>(
            `UPDATE Comments
             SET DeletedAt = NULL, DeletedByUserId = NULL
             WHERE Id = ? AND DeletedAt IS NOT NULL`,
            [id]
        );

        return result.affectedRows > 0;
    }

    async update(input: AdminUpdateCommentInput, db?: PoolConnection): Promise<AdminComment | null> {
        const [result] = await (db ?? this.db).execute<ResultSetHeader>(
            `UPDATE Comments
             SET Comment = ?, Rating = ?
             WHERE Id = ?`,
            [input.comment, input.rating ?? null, input.id]
        );

        if (result.affectedRows === 0)
            return null;

        return this.findByIdForAdmin(input.id, db);
    }

    async delete(id: number, db?: PoolConnection): Promise<boolean> {
        const [result] = await (db ?? this.db).execute<ResultSetHeader>(
            `DELETE FROM Comments
             WHERE Id = ?`,
            [id]
        );

        return result.affectedRows > 0;
    }
}
