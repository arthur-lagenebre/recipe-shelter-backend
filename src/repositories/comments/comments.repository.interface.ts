import type { Comment, CreateCommentInput, UpdateCommentInput } from "./comments.types.js";

export interface CommentRepository {
    create(input: CreateCommentInput): Promise<Comment>;
    update(input: UpdateCommentInput): Promise<Comment | null>;
    softDelete(id: number, userId: number): Promise<boolean>;
    findById(id: number): Promise<Comment | null>
    findByRecipeId(recipeid: number): Promise<Comment[]>;
}
