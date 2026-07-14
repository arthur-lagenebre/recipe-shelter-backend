import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import bcrypt from 'bcrypt';

import { createApp } from '../../src/app.js';
import { AdminRecipeService } from '../../src/services/admin/admin.recipes.services.js';
import { AuthService } from '../../src/services/auth/auth.service.js';
import { CommentService } from '../../src/services/comments/comments.service.js';
import { FavoriteService } from '../../src/services/favorites/favorites.service.js';
import { RecipeSlugService } from '../../src/services/recipes/recipe-slug.service.js';
import { RecipeService } from '../../src/services/recipes/recipes.services.js';
import { createPaginatedResult } from '../../src/utils/pagination.js';
import { startHttpTestServer } from '../helpers/http-test-server.js';

import type { AdminRecipeRepository } from '../../src/repositories/admin/admin.recipe.repository.interface.js';
import type { CommentRepository } from '../../src/repositories/comments/comments.repository.interface.js';
import type { Comment, CreateCommentInput, PublicComment, UpdateCommentInput } from '../../src/repositories/comments/comments.types.js';
import type { FavoriteRepository } from '../../src/repositories/favorites/favorites.repository.interface.js';
import type { Favorite } from '../../src/repositories/favorites/favorites.types.js';
import type { RecipeRepository } from '../../src/repositories/recipes/recipe.repository.interface.js';
import type { Recipe, RecipeInput, RecipeListItem, RecipeSearchFilters, UpdateRecipeInput } from '../../src/repositories/recipes/recipe.types.js';
import type { UserRepository } from '../../src/repositories/users/user.repository.interface.js';
import type { User, UserWithPassword } from '../../src/repositories/users/user.types.js';
import type { EmailValidationService } from '../../src/services/auth/email-validation.service.js';
import type { HttpTestServer } from '../helpers/http-test-server.js';
import type { PaginationOptions } from '../../src/utils/pagination.js';

const now = new Date('2026-07-13T09:00:00.000Z');

function createUser(id: number, mail: string, username: string, roleId: number, passwordHash: string): UserWithPassword {
    return {
        id,
        mail,
        username,
        roleId,
        passwordHash,
        status: 'active',
        emailValidatedAt: now,
        bannedByUserId: null,
        bannedReason: null,
        bannedAt: null,
        createdAt: now,
        updatedAt: now
    };
}

class CriticalFlowUserRepository implements Partial<UserRepository> {
    constructor(private readonly users: UserWithPassword[]) {}

    async findById(id: number): Promise<User | null> {
        return this.users.find((user) => user.id === id) ?? null;
    }

    async findAuthByEmail(mail: string): Promise<UserWithPassword | null> {
        return this.users.find((user) => user.mail === mail) ?? null;
    }
}

class CriticalFlowRecipeRepository implements Partial<RecipeRepository> {
    private readonly recipes = new Map<number, Recipe>();
    private nextId = 1;

    async create(input: RecipeInput): Promise<Recipe> {
        const recipe: Recipe = {
            id: this.nextId++,
            userId: input.userId,
            categoryId: input.categoryId ?? null,
            title: input.title,
            slug: input.slug,
            description: input.description ?? '',
            coverImage: null,
            prepTimeMinutes: input.prepTimeMinutes ?? 0,
            restTimeMinutes: input.restTimeMinutes ?? null,
            cookTimeMinutes: input.cookTimeMinutes ?? null,
            servings: input.servings ?? 1,
            status: 'draft',
            createdAt: now,
            submittedAt: null,
            moderatedAt: null,
            moderatedByUserId: null,
            publishedAt: null,
            archivedAt: null,
            rejectionReason: null,
            updatedAt: now,
            tagIds: input.tagIds ?? [],
            ingredients: (input.ingredients ?? []).map((ingredient, index) => ({
                ingredientId: ingredient.ingredientId,
                quantity: ingredient.quantity ?? null,
                unit: ingredient.unit ?? null,
                note: ingredient.note ?? null,
                sortOrder: ingredient.sortOrder ?? index + 1
            })),
            steps: (input.steps ?? []).map((step, index) => ({
                stepNumber: step.stepNumber ?? index + 1,
                description: step.description
            })),
            equipments: input.equipments ?? []
        };

        this.recipes.set(recipe.id, recipe);
        return recipe;
    }

    async updateDraft(input: UpdateRecipeInput): Promise<Recipe> {
        const current = this.requireRecipe(input.id);
        const updated: Recipe = {
            ...current,
            categoryId: input.categoryId === undefined ? current.categoryId : input.categoryId,
            title: input.title,
            description: input.description ?? current.description,
            prepTimeMinutes: input.prepTimeMinutes ?? current.prepTimeMinutes,
            restTimeMinutes: input.restTimeMinutes === undefined ? current.restTimeMinutes : input.restTimeMinutes,
            cookTimeMinutes: input.cookTimeMinutes === undefined ? current.cookTimeMinutes : input.cookTimeMinutes,
            servings: input.servings ?? current.servings,
            tagIds: input.tagIds ?? current.tagIds,
            ingredients: input.ingredients?.map((ingredient, index) => ({
                ingredientId: ingredient.ingredientId,
                quantity: ingredient.quantity ?? null,
                unit: ingredient.unit ?? null,
                note: ingredient.note ?? null,
                sortOrder: ingredient.sortOrder ?? index + 1
            })) ?? current.ingredients,
            steps: input.steps?.map((step, index) => ({
                stepNumber: step.stepNumber ?? index + 1,
                description: step.description
            })) ?? current.steps,
            equipments: input.equipments ?? current.equipments,
            updatedAt: now
        };
        this.recipes.set(updated.id, updated);
        return updated;
    }

    async findById(id: number): Promise<Recipe | null> {
        return this.recipes.get(id) ?? null;
    }

    async submit(id: number, slug: string): Promise<Recipe> {
        const recipe = this.requireRecipe(id);
        const submitted = { ...recipe, slug, status: 'pending', submittedAt: now, updatedAt: now };
        this.recipes.set(id, submitted);
        return submitted;
    }

    async archive(id: number): Promise<boolean> {
        const recipe = this.recipes.get(id);
        if (!recipe)
            return false;

        this.recipes.set(id, { ...recipe, status: 'archived', archivedAt: now, updatedAt: now });
        return true;
    }

    async existsBySlug(slug: string): Promise<boolean> {
        return [...this.recipes.values()].some((recipe) => recipe.slug === slug);
    }

    async searchPublished(userId: number | null, filters: RecipeSearchFilters, pagination: PaginationOptions) {
        void userId;
        const items = [...this.recipes.values()]
            .filter((recipe) => recipe.status === 'published')
            .filter((recipe) => !filters.q || recipe.title.toLowerCase().includes(filters.q.toLowerCase()))
            .map((recipe) => this.toListItem(recipe));

        return createPaginatedResult(items, items.length, pagination);
    }

    publish(id: number, adminUserId: number): boolean {
        const recipe = this.recipes.get(id);
        if (!recipe)
            return false;

        this.recipes.set(id, {
            ...recipe,
            status: 'published',
            moderatedAt: now,
            moderatedByUserId: adminUserId,
            publishedAt: now,
            updatedAt: now
        });
        return true;
    }

    reject(id: number, adminUserId: number, rejectionReason: string): boolean {
        const recipe = this.recipes.get(id);
        if (!recipe)
            return false;

        this.recipes.set(id, {
            ...recipe,
            status: 'rejected',
            moderatedAt: now,
            moderatedByUserId: adminUserId,
            rejectionReason,
            updatedAt: now
        });
        return true;
    }

    private requireRecipe(id: number): Recipe {
        const recipe = this.recipes.get(id);
        if (!recipe)
            throw new Error(`Recipe ${id} not found`);

        return recipe;
    }

    private toListItem(recipe: Recipe): RecipeListItem {
        return {
            id: recipe.id,
            title: recipe.title,
            slug: recipe.slug,
            description: recipe.description,
            category: null,
            coverImage: recipe.coverImage,
            prepTimeMinutes: recipe.prepTimeMinutes,
            restTimeMinutes: recipe.restTimeMinutes,
            cookTimeMinutes: recipe.cookTimeMinutes,
            servings: recipe.servings,
            authorUsername: 'alice',
            publishedAt: recipe.publishedAt ?? now,
            isFavorite: false
        };
    }
}

class CriticalFlowFavoriteRepository implements FavoriteRepository {
    private readonly favorites = new Map<string, Favorite>();

    constructor(private readonly recipes: CriticalFlowRecipeRepository) {}

    async create(userId: number, recipeId: number): Promise<Favorite> {
        const favorite = { userId, recipeId, createdAt: now };
        this.favorites.set(`${userId}:${recipeId}`, favorite);
        return favorite;
    }

    async delete(userId: number, recipeId: number): Promise<boolean> {
        return this.favorites.delete(`${userId}:${recipeId}`);
    }

    async getFavoriteRecipes(userId: number, pagination: PaginationOptions) {
        const recipeIds = [...this.favorites.values()]
            .filter((favorite) => favorite.userId === userId)
            .map((favorite) => favorite.recipeId);
        const items: RecipeListItem[] = [];

        for (const recipeId of recipeIds) {
            const recipe = await this.recipes.findById(recipeId);
            if (recipe?.status === 'published') {
                items.push({
                    id: recipe.id,
                    title: recipe.title,
                    slug: recipe.slug,
                    description: recipe.description,
                    category: null,
                    coverImage: recipe.coverImage,
                    prepTimeMinutes: recipe.prepTimeMinutes,
                    restTimeMinutes: recipe.restTimeMinutes,
                    cookTimeMinutes: recipe.cookTimeMinutes,
                    servings: recipe.servings,
                    authorUsername: 'alice',
                    publishedAt: recipe.publishedAt ?? now,
                    isFavorite: true
                });
            }
        }

        return createPaginatedResult(items, items.length, pagination);
    }
}

class CriticalFlowCommentRepository implements CommentRepository {
    private readonly comments = new Map<number, Comment>();
    private nextId = 1;

    async create(input: CreateCommentInput): Promise<PublicComment> {
        const comment: Comment = { id: this.nextId++, ...input, createdAt: now, updatedAt: now };
        this.comments.set(comment.id, comment);
        return this.toPublic(comment);
    }

    async update(input: UpdateCommentInput): Promise<PublicComment | null> {
        const current = this.comments.get(input.id);
        if (!current || current.userId !== input.userId)
            return null;

        const updated = { ...current, rating: input.rating, comment: input.comment, updatedAt: now };
        this.comments.set(updated.id, updated);
        return this.toPublic(updated);
    }

    async softDelete(id: number, userId: number): Promise<boolean> {
        const comment = this.comments.get(id);
        if (!comment || comment.userId !== userId)
            return false;

        this.comments.set(id, { ...comment, deletedAt: now, deletedByUserId: userId });
        return true;
    }

    async findById(id: number): Promise<Comment | null> {
        return this.comments.get(id) ?? null;
    }

    async findByRecipeId(recipeId: number): Promise<PublicComment[]> {
        return [...this.comments.values()]
            .filter((comment) => comment.recipeId === recipeId)
            .map((comment) => this.toPublic(comment));
    }

    private toPublic(comment: Comment): PublicComment {
        return {
            id: comment.id,
            recipeId: comment.recipeId,
            author: { id: comment.userId, username: 'alice' },
            parentCommentId: comment.parentCommentId ?? null,
            moderatedAt: comment.moderatedAt ?? null,
            deletedAt: comment.deletedAt ?? null,
            rating: comment.rating ?? null,
            comment: comment.comment,
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt
        };
    }
}

function cookieFrom(response: Response): string {
    const setCookie = response.headers.get('set-cookie');
    assert.ok(setCookie, 'Expected a session cookie');
    return setCookie.split(';', 1)[0];
}

describe('critical user journey E2E', () => {
    let server: HttpTestServer;
    let userCookie: string;
    let adminCookie: string;

    before(async () => {
        const passwordHash = await bcrypt.hash('StrongPass123!', 4);
        const users = new CriticalFlowUserRepository([
            createUser(2, 'alice@example.com', 'alice', 2, passwordHash),
            createUser(1, 'admin@example.com', 'admin', 1, passwordHash)
        ]);
        const recipes = new CriticalFlowRecipeRepository();
        const recipeRepository = recipes as unknown as RecipeRepository;
        const adminRecipeRepository = {
            async publish(id: number, adminUserId: number) { return recipes.publish(id, adminUserId); },
            async reject(id: number, adminUserId: number, reason: string) { return recipes.reject(id, adminUserId, reason); }
        } as unknown as AdminRecipeRepository;
        const authService = new AuthService(users as unknown as UserRepository, {} as EmailValidationService);

        const app = createApp({
            authService,
            authUserRepository: users as Pick<UserRepository, 'findById'>,
            recipeService: new RecipeService(recipeRepository, new RecipeSlugService(recipeRepository)),
            adminRecipeService: new AdminRecipeService(recipeRepository, adminRecipeRepository),
            favoriteService: new FavoriteService(new CriticalFlowFavoriteRepository(recipes)),
            commentService: new CommentService(new CriticalFlowCommentRepository())
        });

        server = await startHttpTestServer(app);
    });

    after(async () => server.close());

    it('rejects protected actions and invalid credentials', async () => {
        const protectedResponse = await fetch(`${server.baseUrl}/api/v1/recipes`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: 'Protected recipe' })
        });
        assert.equal(protectedResponse.status, 401);

        const loginResponse = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mail: 'alice@example.com', password: 'wrong-password' })
        });
        assert.equal(loginResponse.status, 401);
        assert.equal((await loginResponse.json() as { error: { code: string } }).error.code, 'AUTH_INVALID_CREDENTIALS');
    });

    it('authenticates a user with an HttpOnly session cookie', async () => {
        const response = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mail: 'alice@example.com', password: 'StrongPass123!' })
        });

        assert.equal(response.status, 200);
        assert.match(response.headers.get('set-cookie') ?? '', /HttpOnly/i);
        userCookie = cookieFrom(response);

        const meResponse = await fetch(`${server.baseUrl}/api/v1/auth/me`, {
            headers: { cookie: userCookie }
        });
        assert.equal(meResponse.status, 200);
        assert.equal((await meResponse.json() as { auth: { username: string } }).auth.username, 'alice');
    });

    it('creates and submits a recipe, then enforces admin moderation', async () => {
        const createResponse = await fetch(`${server.baseUrl}/api/v1/recipes`, {
            method: 'POST',
            headers: { cookie: userCookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                title: 'Weeknight pasta',
                description: 'A quick family dinner',
                prepTimeMinutes: 10,
                cookTimeMinutes: 20,
                servings: 4,
                ingredients: [{ ingredientId: 3, quantity: 250, unit: 'g' }],
                steps: [{ description: 'Cook the pasta and combine.' }]
            })
        });
        const created = await createResponse.json() as Recipe;
        assert.equal(createResponse.status, 201);
        assert.equal(created.status, 'draft');
        assert.equal(created.userId, 2);

        const updateResponse = await fetch(`${server.baseUrl}/api/v1/recipes/me/${created.id}`, {
            method: 'PATCH',
            headers: { cookie: userCookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                title: 'Weeknight tomato pasta',
                description: 'An updated family dinner',
                servings: 6
            })
        });
        const updated = await updateResponse.json() as Recipe;
        assert.equal(updateResponse.status, 200);
        assert.equal(updated.title, 'Weeknight tomato pasta');
        assert.equal(updated.servings, 6);

        const submitResponse = await fetch(`${server.baseUrl}/api/v1/recipes/me/${created.id}/submit`, {
            method: 'POST',
            headers: { cookie: userCookie }
        });
        const submitted = await submitResponse.json() as Recipe;
        assert.equal(submitResponse.status, 200);
        assert.equal(submitted.status, 'pending');
        assert.equal(submitted.slug, 'weeknight-tomato-pasta');

        const forbiddenResponse = await fetch(`${server.baseUrl}/api/v1/admin/recipes/${created.id}/approve`, {
            method: 'POST',
            headers: { cookie: userCookie }
        });
        assert.equal(forbiddenResponse.status, 403);
        assert.equal((await forbiddenResponse.json() as { error: { code: string } }).error.code, 'ADMIN_ACCESS_REQUIRED');

        const adminLogin = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mail: 'admin@example.com', password: 'StrongPass123!' })
        });
        assert.equal(adminLogin.status, 200);
        adminCookie = cookieFrom(adminLogin);

        const adminEditResponse = await fetch(`${server.baseUrl}/api/v1/recipes/me/${created.id}`, {
            method: 'PATCH',
            headers: { cookie: adminCookie, 'content-type': 'application/json' },
            body: JSON.stringify({ title: 'Admin edit attempt' })
        });
        assert.equal(adminEditResponse.status, 403);
        assert.equal((await adminEditResponse.json() as { error: { code: string } }).error.code, 'RECIPES_EDIT_FORBIDDEN');

        const approveResponse = await fetch(`${server.baseUrl}/api/v1/admin/recipes/${created.id}/approve`, {
            method: 'POST',
            headers: { cookie: adminCookie }
        });
        assert.equal(approveResponse.status, 200);
        assert.deepEqual(await approveResponse.json(), { ok: true });

        const publicResponse = await fetch(`${server.baseUrl}/api/v1/recipes?q=tomato`);
        const publicBody = await publicResponse.json() as { items: RecipeListItem[] };
        assert.equal(publicResponse.status, 200);
        assert.equal(publicBody.items.length, 1);
        assert.equal(publicBody.items[0]?.slug, 'weeknight-tomato-pasta');
    });

    it('favorites and comments on the published recipe', async () => {
        const favoriteResponse = await fetch(`${server.baseUrl}/api/v1/favorites/1`, {
            method: 'POST',
            headers: { cookie: userCookie }
        });
        assert.equal(favoriteResponse.status, 200);

        const favoritesResponse = await fetch(`${server.baseUrl}/api/v1/favorites/me`, {
            headers: { cookie: userCookie }
        });
        const favorites = await favoritesResponse.json() as { items: RecipeListItem[] };
        assert.equal(favoritesResponse.status, 200);
        assert.equal(favorites.items[0]?.isFavorite, true);

        const commentResponse = await fetch(`${server.baseUrl}/api/v1/recipes/1/comments`, {
            method: 'POST',
            headers: { cookie: userCookie, 'content-type': 'application/json' },
            body: JSON.stringify({ rating: 5, comment: 'Reliable and delicious.' })
        });
        assert.equal(commentResponse.status, 201);
        assert.equal((await commentResponse.json() as PublicComment).author.username, 'alice');

        const forbiddenUpdate = await fetch(`${server.baseUrl}/api/v1/comments/1`, {
            method: 'PATCH',
            headers: { cookie: adminCookie, 'content-type': 'application/json' },
            body: JSON.stringify({ rating: 4, comment: 'Admin edit attempt' })
        });
        assert.equal(forbiddenUpdate.status, 403);
        assert.equal((await forbiddenUpdate.json() as { error: { code: string } }).error.code, 'COMMENT_ACCESS_DENIED');

        const updateResponse = await fetch(`${server.baseUrl}/api/v1/comments/1`, {
            method: 'PATCH',
            headers: { cookie: userCookie, 'content-type': 'application/json' },
            body: JSON.stringify({ rating: 4, comment: 'Still reliable and delicious.' })
        });
        assert.equal(updateResponse.status, 200);
        assert.equal((await updateResponse.json() as PublicComment).rating, 4);

        const replyResponse = await fetch(`${server.baseUrl}/api/v1/recipes/1/comments`, {
            method: 'POST',
            headers: { cookie: userCookie, 'content-type': 'application/json' },
            body: JSON.stringify({ parentCommentId: 1, comment: 'A useful reply.' })
        });
        assert.equal(replyResponse.status, 201);

        const nestedReply = await fetch(`${server.baseUrl}/api/v1/recipes/1/comments`, {
            method: 'POST',
            headers: { cookie: userCookie, 'content-type': 'application/json' },
            body: JSON.stringify({ parentCommentId: 2, comment: 'This nesting is forbidden.' })
        });
        assert.equal(nestedReply.status, 400);
        assert.equal((await nestedReply.json() as { error: { code: string } }).error.code, 'COMMENTS_CREATE_NESTED_REPLY');

        const deleteReply = await fetch(`${server.baseUrl}/api/v1/comments/2`, {
            method: 'DELETE',
            headers: { cookie: userCookie }
        });
        assert.equal(deleteReply.status, 200);

        const commentsResponse = await fetch(`${server.baseUrl}/api/v1/recipes/1/comments`);
        const comments = await commentsResponse.json() as PublicComment[];
        assert.equal(commentsResponse.status, 200);
        assert.equal(comments.length, 2);
        assert.equal(comments[0]?.rating, 4);
        assert.ok(comments[1]?.deletedAt);
    });

    it('rejects a second recipe and lets its owner archive it', async () => {
        const create = await fetch(`${server.baseUrl}/api/v1/recipes`, {
            method: 'POST',
            headers: { cookie: userCookie, 'content-type': 'application/json' },
            body: JSON.stringify({ title: 'Recipe to reject', description: 'Incomplete details' })
        });
        const recipe = await create.json() as Recipe;
        assert.equal(create.status, 201);

        const submit = await fetch(`${server.baseUrl}/api/v1/recipes/me/${recipe.id}/submit`, {
            method: 'POST',
            headers: { cookie: userCookie }
        });
        assert.equal(submit.status, 200);

        const reject = await fetch(`${server.baseUrl}/api/v1/admin/recipes/${recipe.id}/reject`, {
            method: 'POST',
            headers: { cookie: adminCookie, 'content-type': 'application/json' },
            body: JSON.stringify({ rejectionReason: 'Preparation details are incomplete.' })
        });
        assert.equal(reject.status, 200);

        const archive = await fetch(`${server.baseUrl}/api/v1/recipes/me/${recipe.id}/archive`, {
            method: 'POST',
            headers: { cookie: userCookie }
        });
        assert.equal(archive.status, 200);
        assert.deepEqual(await archive.json(), { ok: true });
    });

    it('clears the browser session on logout', async () => {
        const logoutResponse = await fetch(`${server.baseUrl}/api/v1/auth/logout`, {
            method: 'POST',
            headers: { cookie: userCookie }
        });
        assert.equal(logoutResponse.status, 200);
        assert.match(logoutResponse.headers.get('set-cookie') ?? '', /Expires=Thu, 01 Jan 1970/i);

        const meResponse = await fetch(`${server.baseUrl}/api/v1/auth/me`);
        assert.equal(meResponse.status, 401);
    });
});
