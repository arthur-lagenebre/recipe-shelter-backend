import type { AdminComment, AdminUpdateCommentInput } from './admin.comments.types.js';
import type { PoolConnection } from 'mysql2/promise';

export interface AdminCommentRepository {
    findModeratedForAdmin(): Promise<AdminComment[]>;
    countModeratedForAdmin(): Promise<number>;
    findSoftDeletedForAdmin(): Promise<AdminComment[]>;
    countSoftDeletedForAdmin(): Promise<number>;
    findByIdForAdmin(id: number, db?: PoolConnection): Promise<AdminComment | null>;
    hide(id: number, moderatedByUserId: number, db?: PoolConnection): Promise<boolean>;
    unmoderate(id: number, db?: PoolConnection): Promise<boolean>;
    restore(id: number, db?: PoolConnection): Promise<boolean>;
    update(input: AdminUpdateCommentInput, db?: PoolConnection): Promise<AdminComment | null>;
    delete(id: number, db?: PoolConnection): Promise<boolean>;
}
