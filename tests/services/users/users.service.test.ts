import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { UserService } from '../../../src/services/users/users.service.js';
import { HttpError } from '../../../src/utils/errors.js';

import type { RecipeRepository } from '../../../src/repositories/recipes/recipe.repository.interface.js';
import type { RecipeListItem } from '../../../src/repositories/recipes/recipe.types.js';
import type { UserRepository } from '../../../src/repositories/users/user.repository.interface.js';
import type { User } from '../../../src/repositories/users/user.types.js';

const baseUser: User = {
    id: 2,
    mail: 'user@example.com',
    username: 'testuser',
    roleId: 2,
    status: 'banned',
    emailValidatedAt: new Date('2026-05-09T10:00:00.000Z'),
    bannedByUserId: 1,
    bannedReason: 'Repeated abuse of the platform rules.',
    bannedAt: new Date('2026-05-10T10:00:00.000Z'),
    createdAt: new Date('2026-05-09T10:00:00.000Z'),
    updatedAt: new Date('2026-05-10T10:00:00.000Z')
};

const baseRecipe: RecipeListItem = {
    id: 12,
    title: 'Published recipe',
    slug: 'published-recipe',
    description: 'A public recipe.',
    category: 'Dinner',
    coverImageUrl: null,
    prepTimeMinutes: 15,
    cookTimeMinutes: 25,
    restTimeMinutes: null,
    servings: 4,
    authorUsername: 'testuser',
    publishedAt: new Date('2026-05-11T10:00:00.000Z'),
    isFavorite: true
};

class FakeUserRepository {
    user: User | null = baseUser;
    findByUsernameInput: string | null = null;

    async findByUsername(username: string): Promise<User | null> {
        this.findByUsernameInput = username;

        return this.user;
    }
}

class FakeRecipeRepository {
    recipes: RecipeListItem[] = [baseRecipe];
    viewerUserIdInput: number | null | undefined;
    authorUserIdInput: number | null = null;

    async findPublishedByAuthorId(viewerUserId: number | null, authorUserId: number): Promise<RecipeListItem[]> {
        this.viewerUserIdInput = viewerUserId;
        this.authorUserIdInput = authorUserId;

        return this.recipes;
    }
}

function assertHttpError(error: unknown, code: string, status: number): void {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
}

describe('UserService', () => {
    let users: FakeUserRepository;
    let recipes: FakeRecipeRepository;
    let service: UserService;

    beforeEach(() => {
        users = new FakeUserRepository();
        recipes = new FakeRecipeRepository();
        service = new UserService(users as unknown as UserRepository, recipes as unknown as RecipeRepository);
    });

    it('gets a public user profile with published recipes', async () => {
        const result = await service.getUser('  testuser  ', 7);

        assert.equal(users.findByUsernameInput, 'testuser');
        assert.equal(recipes.viewerUserIdInput, 7);
        assert.equal(recipes.authorUserIdInput, 2);
        assert.deepEqual(result, {
            id: 2,
            username: 'testuser',
            publishedRecipes: [baseRecipe]
        });

        const resultRecord = result as Record<string, unknown>;
        assert.equal('email' in resultRecord, false);
        assert.equal('mail' in resultRecord, false);
        assert.equal('status' in resultRecord, false);
        assert.equal('roleId' in resultRecord, false);
        assert.equal('banReason' in resultRecord, false);
        assert.equal('bannedReason' in resultRecord, false);
        assert.equal('bannedAt' in resultRecord, false);
        assert.equal('moderationLogs' in resultRecord, false);
    });

    it('rejects unknown usernames without loading recipes', async () => {
        users.user = null;

        await assert.rejects(
            () => service.getUser('unknown'),
            (error) => {
                assertHttpError(error, 'USER_NOT_FOUND', 404);

                return true;
            }
        );
        assert.equal(users.findByUsernameInput, 'unknown');
        assert.equal(recipes.authorUserIdInput, null);
    });
});
