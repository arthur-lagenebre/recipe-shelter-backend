import type { Comment, CreateCommentInput, PublicComment, UpdateCommentInput } from './comment.types.js';

export interface CommentRepository {
    create(input: CreateCommentInput): Promise<PublicComment>;
    update(input: UpdateCommentInput): Promise<PublicComment | null>;
    softDelete(id: number, userId: number): Promise<boolean>;
    findById(id: number): Promise<Comment | null>;
    findByRecipeId(recipeid: number): Promise<PublicComment[]>;
}
