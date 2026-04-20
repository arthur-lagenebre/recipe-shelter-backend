import { type Ingredient } from "./ingredient.types.js";

export interface IngredientRepository {
    findAll(): Promise<Ingredient[]>;
    findById(id: number): Promise<Ingredient | null>;
}