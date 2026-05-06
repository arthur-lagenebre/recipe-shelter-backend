import { type Favorite } from "./favorites.types.js";

export interface FavoriteRepository {
    create(userId: number, recipeId: number): Promise<Favorite>;
    delete(userId: number, recipeId: number): Promise<boolean>;
}
