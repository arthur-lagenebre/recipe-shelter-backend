import type { Category } from "./category.types.js";

export interface CategoryRepository {
    findAll(): Promise<Category[]>;
    findById(id: number): Promise<Category | null>;
}