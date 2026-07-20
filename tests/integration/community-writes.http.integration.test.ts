import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';

import { createCatalogProposalsRouter } from '../../src/api/catalog/catalog-proposals.routes.js';
import { createCommentsRouter, createRecipeCommentsRouter } from '../../src/api/comments/comments.routes.js';
import { createFavoritesRouter } from '../../src/api/favorites/favorites.routes.js';
import { createRecipesRouter } from '../../src/api/recipes/recipes.routes.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { notFound } from '../../src/middlewares/not-found.js';
import {
    configureAuthRbacRepository,
    configureAuthSessionRepository,
    configureAuthUserRepository
} from '../../src/middlewares/require-auth.js';
import { PERMISSIONS } from '../../src/security/permissions.js';
import { TestSessionRepository } from '../helpers/auth-session.js';
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
    { name: 'create tag proposal', method: 'POST', path: '/api/v1/catalog/tag-proposals' },
    { name: 'create ingredient proposal', method: 'POST', path: '/api/v1/catalog/ingredient-proposals' },
    { name: 'create comment', method: 'POST', path: '/api/v1/recipes/42/comments' },
    { name: 'update comment', method: 'PATCH', path: '/api/v1/comments/7' },
    { name: 'delete comment', method: 'DELETE', path: '/api/v1/comments/7' },
    { name: 'create favorite', method: 'POST', path: '/api/v1/favorites/42' },
    { name: 'delete favorite', method: 'DELETE', path: '/api/v1/favorites/42' }
] as const;

describe('community write HTTP boundary', () => {
    let server: HttpTestServer;
    let controllerCalls = 0;
    let staffCookie: string;
    let communityCookie: string;

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
        const catalogProposalsController = {
            createTagProposal: unexpectedControllerCall,
            createIngredientProposal: unexpectedControllerCall
        };
        const favoritesController = {
            createFavorite: unexpectedControllerCall,
            deleteFavorite: unexpectedControllerCall,
            getFavoriteRecipes: unexpectedControllerCall
        };

        configureAuthUserRepository({
            async findById(id) {
                if (id === staff.id) return staff;
                if (id === communityUser.id) return communityUser;
                return null;
            }
        });
        configureAuthRbacRepository({
            async findPermissionCodesByStaffUserId() {
                return Object.values(PERMISSIONS);
            }
        });
        const sessions = new TestSessionRepository();
        configureAuthSessionRepository(sessions);
        staffCookie = await sessions.issueCookie(staff, 'admin');
        communityCookie = await sessions.issueCookie(communityUser, 'app');

        const app = express();
        app.use(cookieParser());
        app.use(express.json());
        app.use('/api/v1/catalog', createCatalogProposalsRouter(catalogProposalsController));
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
        assert.equal(((await response.json()) as { error: { code: string } }).error.code, 'AUTH_NO_TOKEN');
        assert.equal(controllerCalls, 0);
    });

    it('rejects the admin cookie on every community write endpoint before controllers and uploads', async () => {
        for (const endpoint of communityWriteEndpoints) {
            const response = await fetch(`${server.baseUrl}${endpoint.path}`, {
                method: endpoint.method,
                headers: { cookie: staffCookie }
            });

            assert.equal(response.status, 401, endpoint.name);
            assert.deepEqual(
                await response.json(),
                {
                    error: {
                        message: 'Missing session cookie',
                        code: 'AUTH_NO_TOKEN'
                    }
                },
                endpoint.name
            );
        }

        assert.equal(controllerCalls, 0);
    });

    it('allows an active community account through the write boundary', async () => {
        const response = await fetch(`${server.baseUrl}/api/v1/recipes`, {
            method: 'POST',
            headers: { cookie: communityCookie }
        });

        assert.equal(response.status, 204);
        assert.equal(controllerCalls, 1);
    });
});
