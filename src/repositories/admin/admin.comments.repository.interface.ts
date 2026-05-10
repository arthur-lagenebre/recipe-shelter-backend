import type { AdminComment, AdminUpdateCommentInput } from './admin.comments.types.js';

export interface AdminCommentRepository {
    findModeratedForAdmin(): Promise<AdminComment[]>;
    countModeratedForAdmin(): Promise<number>;
    findSoftDeletedForAdmin(): Promise<AdminComment[]>;
    countSoftDeletedForAdmin(): Promise<number>;
    findByIdForAdmin(id: number): Promise<AdminComment | null>;
    hide(id: number, moderatedByUserId: number): Promise<boolean>;
    unmoderate(id: number): Promise<boolean>;
    restore(id: number): Promise<boolean>;
    update(input: AdminUpdateCommentInput): Promise<AdminComment | null>;
    delete(id: number): Promise<boolean>;
}
