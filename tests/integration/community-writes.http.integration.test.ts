import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';

import { createCommentsRouter, createRecipeCommentsRouter } from '../../src/api/comments/comments.routes.js';
import { createFavoritesRouter } from '../../src/api/favorites/favorites.routes.js';
import { createRecipesRouter } from '../../src/api/recipes/recipes.routes.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { notFound } from '../../src/middlewares/not-found.js';
import { configureAuthRbacRepository, configureAuthUserRepository } from '../../src/middlewares/require-auth.js';
import { PERMISSIONS } from '../../src/security/permissions.js';
import { env } from '../../src/utils/env.js';
import { sessionCookieName } from '../../src/utils/session-cookie.js';
import { startHttpTestServer } from '../helpers/http-test-server.js';

import type { User } from '../../src/repositories/users/user.types.js';
import type { HttpTestServer } from '../helpers/http-test-server.js';
import type { RequestHandler } from 'express';

const now = new Date('2026-07-15T10:00:00.000Z');
const staff: User = {
    id: 1,
    mail: 'staff@test.local',
    username: 'staff',
    accountType: 'staff',
    status: 'active',
    emailValidatedAt: now,
    bannedByUserId: null,
    bannedReason: null,
    bannedAt: null,
    createdAt: now,
    updatedAt: now
};
const communityUser: User = {
    ...staff,
    id: 2,
    mail: 'community@test.local',
    username: 'community',
    accountType: 'community'
};

const communityWriteEndpoints = [
    { name: 'create recipe', method: 'POST', path: '/api/v1/recipes' },
    { name: 'replace recipe cover image', method: 'PUT', path: '/api/v1/recipes/42/cover-image' },
    { name: 'delete recipe cover image', method: 'DELETE', path: '/api/v1/recipes/42/cover-image' },
    { name: 'update personal recipe', method: 'PATCH', path: '/api/v1/recipes/me/42' },
    { name: 'submit recipe proposal', method: 'POST', path: '/api/v1/recipes/me/42/submit' },
    { name: 'archive personal recipe', method: 'POST', path: '/api/v1/recipes/me/42/archive' },
    { name: 'create comment', method: 'POST', path: '/api/v1/recipes/42/comments' },
    { name: 'update comment', method: 'PATCH', path: '/api/v1/comments/7' },
    { name: 'delete comment', method: 'DELETE', path: '/api/v1/comments/7' },
    { name: 'create favorite', method: 'POST', path: '/api/v1/favorites/42' },
    { name: 'delete favorite', method: 'DELETE', path: '/api/v1/favorites/42' }
] as const;

function sessionCookie(user: User): string {
    const token = jwt.sign({ sub: user.id, username: user.username }, env.auth.jwtSecret);
    return `${sessionCookieName}=${token}`;
}

describe('community write HTTP boundary', () => {
    let server: HttpTestServer;
    let controllerCalls = 0;

    before(async () => {
        const unexpectedControllerCall: RequestHandler = (_req, res) => {
            controllerCalls += 1;
            res.status(204).send();
        };
        const recipesController = {
            getMyRecipes: unexpectedControllerCall,
            createRecipe: unexpectedControllerCall,
            getRecipes: unexpectedControllerCall,
            searchRecipes: unexpectedControllerCall,
            getRecentRecipes: unexpectedControllerCall,
            getRecipe: unexpectedControllerCall,
            getRecipeBySlug: unexpectedControllerCall,
            updateRecipe: unexpectedControllerCall,
            submitRecipe: unexpectedControllerCall,
            archiveRecipe: unexpectedControllerCall,
            replaceCoverImage: unexpectedControllerCall,
            deleteCoverImage: unexpectedControllerCall
        };
        const commentsController = {
            createComment: unexpectedControllerCall,
            updateComment: unexpectedControllerCall,
            deleteComment: unexpectedControllerCall,
            getRecipeComments: unexpectedControllerCall
        };
        const favoritesController = {
            createFavorite: unexpectedControllerCall,
            deleteFavorite: unexpectedControllerCall,
            getFavoriteRecipes: unexpectedControllerCall
        };

        configureAuthUserRepository({
            async findById(id) {
                if (id === staff.id)
                    return staff;
                if (id === communityUser.id)
                    return communityUser;
                return null;
            }
        });
        configureAuthRbacRepository({
            async findPermissionCodesByStaffUserId() { return Object.values(PERMISSIONS); }
        });

        const app = express();
        app.use(cookieParser());
        app.use(express.json());
        app.use('/api/v1/comments', createCommentsRouter(commentsController));
        app.use('/api/v1/favorites', createFavoritesRouter(favoritesController));
        app.use('/api/v1/recipes/:recipeId/comments', createRecipeCommentsRouter(commentsController));
        app.use('/api/v1/recipes', createRecipesRouter(recipesController));
        app.use(notFound);
        app.use(errorHandler);

        server = await startHttpTestServer(app);
    });

    after(async () => server.close());

    it('keeps unauthenticated community writes behind authentication', async () => {
        const response = await fetch(`${server.baseUrl}/api/v1/recipes`, { method: 'POST' });

        assert.equal(response.status, 401);
        assert.equal((await response.json() as { error: { code: string } }).error.code, 'AUTH_NO_TOKEN');
        assert.equal(controllerCalls, 0);
    });

    it('returns 403 for staff on every community write endpoint before controllers and uploads', async () => {
        for (const endpoint of communityWriteEndpoints) {
            const response = await fetch(`${server.baseUrl}${endpoint.path}`, {
                method: endpoint.method,
                headers: { cookie: sessionCookie(staff) }
            });

            assert.equal(response.status, 403, endpoint.name);
            assert.deepEqual(await response.json(), {
                error: {
                    message: 'Active community account is required',
                    code: 'AUTH_COMMUNITY_ACCOUNT_REQUIRED'
                }
            }, endpoint.name);
        }

        assert.equal(controllerCalls, 0);
    });

    it('allows an active community account through the write boundary', async () => {
        const response = await fetch(`${server.baseUrl}/api/v1/recipes`, {
            method: 'POST',
            headers: { cookie: sessionCookie(communityUser) }
        });

        assert.equal(response.status, 204);
        assert.equal(controllerCalls, 1);
    });
});
