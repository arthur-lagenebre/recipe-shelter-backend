import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import bcrypt from 'bcrypt';

import { UserService } from '../../../src/services/users/users.service.js';
import { HttpError } from '../../../src/utils/errors.js';

import type { SessionRepository } from '../../../src/repositories/auth/session.repository.interface.js';
import type { RecipeRepository } from '../../../src/repositories/recipes/recipe.repository.interface.js';
import type { RecipeListItem } from '../../../src/repositories/recipes/recipe.types.js';
import type { UserRepository } from '../../../src/repositories/users/user.repository.interface.js';
import type { User, UserWithPassword } from '../../../src/repositories/users/user.types.js';

const baseUser: User = {
    id: 2,
    mail: 'user@example.com',
    username: 'testuser',
    accountType: 'community',
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
    coverImage: null,
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
    userWithPassword: UserWithPassword | null = null;
    userByEmail: User | null = null;
    updatedEmail: { userId: number; mail: string } | null = null;
    updatedPassword: { userId: number; passwordHash: string } | null = null;
    updatedUsername: { userId: number; username: string } | null = null;
    findByUsernameInput: string | null = null;
    findByIdInput: number | null = null;

    async findByUsername(username: string): Promise<User | null> {
        this.findByUsernameInput = username;

        return this.user;
    }

    async findById(id: number): Promise<User | null> {
        this.findByIdInput = id;

        return this.user;
    }

    async findWithPasswordById(): Promise<UserWithPassword | null> {
        return this.userWithPassword;
    }

    async findByEmail(): Promise<User | null> {
        return this.userByEmail;
    }

    async updateEmail(userId: number, mail: string): Promise<void> {
        this.updatedEmail = { userId, mail };
        this.user = this.user ? { ...this.user, mail } : this.user;
    }

    async updatePassword(userId: number, passwordHash: string): Promise<void> {
        this.updatedPassword = { userId, passwordHash };
    }

    async updateUsername(userId: number, username: string): Promise<void> {
        this.updatedUsername = { userId, username };
        this.user = this.user ? { ...this.user, username } : this.user;
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

class FakeSessionRepository {
    revocations: Array<{
        userId: number;
        revocationType: 'password_changed';
        exceptSessionId?: string;
    }> = [];

    async revokeAllCommunitySessions(userId: number, revocationType: 'password_changed', exceptSessionId?: string): Promise<number> {
        this.revocations.push({ userId, revocationType, exceptSessionId });

        return 1;
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
    let sessions: FakeSessionRepository;
    let service: UserService;

    beforeEach(() => {
        users = new FakeUserRepository();
        recipes = new FakeRecipeRepository();
        sessions = new FakeSessionRepository();
        service = new UserService(
            users as unknown as UserRepository,
            recipes as unknown as RecipeRepository,
            sessions as unknown as SessionRepository
        );
    });

    it('gets a public user profile with published recipes', async () => {
        const result = await service.getUser('  testuser  ', 7);

        assert.equal(users.findByUsernameInput, 'testuser');
        assert.equal(recipes.viewerUserIdInput, 7);
        assert.equal(recipes.authorUserIdInput, 2);
        assert.deepEqual(result, {
            id: 2,
            username: 'testuser',
            accountType: 'community',
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

    it('does not expose a public community profile for staff accounts', async () => {
        users.user = { ...baseUser, accountType: 'staff', status: 'active' };

        await assert.rejects(
            () => service.getUser('testuser'),
            (error) => {
                assertHttpError(error, 'USER_NOT_FOUND', 404);
                return true;
            }
        );
        assert.equal(recipes.authorUserIdInput, null);
    });

    it('gets the current user without exposing moderation-only fields', async () => {
        const result = await service.getMe(2);

        assert.equal(users.findByIdInput, 2);
        assert.deepEqual(result, {
            id: 2,
            mail: 'user@example.com',
            username: 'testuser',
            accountType: 'community',
            createdAt: baseUser.createdAt,
            updatedAt: baseUser.updatedAt
        });
    });

    it('rejects getMe when the user does not exist', async () => {
        users.user = null;

        await assert.rejects(
            () => service.getMe(99),
            (error) => {
                assertHttpError(error, 'USER_NOT_FOUND', 404);
                return true;
            }
        );
    });

    it('updates an email after validating password and uniqueness', async () => {
        users.userWithPassword = { ...baseUser, passwordHash: await bcrypt.hash('current-password', 4) };

        const result = await service.updateEmail(2, ' NEW@Example.COM ', 'current-password');

        assert.deepEqual(users.updatedEmail, { userId: 2, mail: 'new@example.com' });
        assert.equal(result.mail, 'new@example.com');
    });

    it('rejects invalid email updates', async () => {
        users.userWithPassword = { ...baseUser, passwordHash: await bcrypt.hash('current-password', 4) };

        await assert.rejects(() => service.updateEmail(2, '', 'current-password'), (error) => {
            assertHttpError(error, 'USERS_UPDATE_EMAIL_MISSING_EMAIL', 400);
            return true;
        });
        await assert.rejects(() => service.updateEmail(2, 'invalid', 'current-password'), (error) => {
            assertHttpError(error, 'USERS_UPDATE_EMAIL_INVALID_EMAIL', 400);
            return true;
        });
        await assert.rejects(() => service.updateEmail(2, 'new@example.com', 'wrong'), (error) => {
            assertHttpError(error, 'USERS_UPDATE_EMAIL_BAD_PASSWORD', 401);
            return true;
        });
        await assert.rejects(() => service.updateEmail(2, baseUser.mail, 'current-password'), (error) => {
            assertHttpError(error, 'USERS_UPDATE_EMAIL_SAME_EMAIL', 400);
            return true;
        });
        users.userByEmail = { ...baseUser, id: 99, mail: 'taken@example.com' };
        await assert.rejects(() => service.updateEmail(2, 'taken@example.com', 'current-password'), (error) => {
            assertHttpError(error, 'USERS_UPDATE_EMAIL_ALREADY_USED', 409);
            return true;
        });
    });

    it('updates passwords after validating the current password and policy', async () => {
        users.userWithPassword = { ...baseUser, passwordHash: await bcrypt.hash('current-password', 4) };

        await service.updatePassword(2, 'current-password', 'new-password', 'current-session-id');

        assert.equal(users.updatedPassword?.userId, 2);
        assert.equal(await bcrypt.compare('new-password', users.updatedPassword?.passwordHash ?? ''), true);
        assert.deepEqual(sessions.revocations, [{
            userId: 2,
            revocationType: 'password_changed',
            exceptSessionId: 'current-session-id'
        }]);
    });

    it('updates the password and revokes every active session when no current session id is available', async () => {
        users.userWithPassword = { ...baseUser, passwordHash: await bcrypt.hash('current-password', 4) };

        await service.updatePassword(2, 'current-password', 'new-password', null);

        assert.equal(await bcrypt.compare('new-password', users.updatedPassword?.passwordHash ?? ''), true);
        assert.deepEqual(sessions.revocations, [{ userId: 2, revocationType: 'password_changed', exceptSessionId: undefined }]);
    });

    it('rejects invalid password updates', async () => {
        users.userWithPassword = { ...baseUser, passwordHash: await bcrypt.hash('current-password', 4) };

        await assert.rejects(() => service.updatePassword(2, 'wrong', 'new-password', null), (error) => {
            assertHttpError(error, 'USERS_UPDATE_PASSWORD_BAD_CURRENT', 401);
            return true;
        });
        await assert.rejects(() => service.updatePassword(2, 'current-password', 'current-password', null), (error) => {
            assertHttpError(error, 'USERS_UPDATE_PASSWORD_SAME_PASSWORD', 400);
            return true;
        });
        await assert.rejects(() => service.updatePassword(2, 'current-password', 'short', null), (error) => {
            assertHttpError(error, 'USERS_UPDATE_PASSWORD_WEAK_PASSWORD', 400);
            return true;
        });
        assert.deepEqual(sessions.revocations, []);
    });

    it('updates usernames after validating password and uniqueness', async () => {
        users.userWithPassword = { ...baseUser, passwordHash: await bcrypt.hash('current-password', 4) };

        const result = await service.updateUsername(2, 'current-password', ' newname ');

        assert.deepEqual(users.updatedUsername, { userId: 2, username: 'newname' });
        assert.equal(result.username, 'newname');
    });

    it('rejects invalid username updates', async () => {
        users.userWithPassword = { ...baseUser, passwordHash: await bcrypt.hash('current-password', 4) };

        await assert.rejects(() => service.updateUsername(2, 'current-password', ' '), (error) => {
            assertHttpError(error, 'USERS_UPDATE_USERNAME_MISSING_USERNAME', 400);
            return true;
        });
        await assert.rejects(() => service.updateUsername(2, 'current-password', 'ab'), (error) => {
            assertHttpError(error, 'USERS_UPDATE_USERNAME_WEAK_USERNAME', 400);
            return true;
        });
        await assert.rejects(() => service.updateUsername(2, 'wrong', 'newname'), (error) => {
            assertHttpError(error, 'USERS_UPDATE_USERNAME_BAD_PASSWORD', 401);
            return true;
        });
        await assert.rejects(() => service.updateUsername(2, 'current-password', baseUser.username), (error) => {
            assertHttpError(error, 'USERS_UPDATE_USERNAME_SAME_USERNAME', 400);
            return true;
        });
        users.user = { ...baseUser, id: 99, username: 'taken' };
        await assert.rejects(() => service.updateUsername(2, 'current-password', 'taken'), (error) => {
            assertHttpError(error, 'USERS_UPDATE_USERNAME_ALREADY_USED', 409);
            return true;
        });
    });
});
