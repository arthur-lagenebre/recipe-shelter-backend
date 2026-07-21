import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';

import { createCatalogProposalsController } from '../../src/api/catalog/catalog-proposals.controller.js';
import { CATALOG_PROPOSALS_RATE_LIMIT_MAX_ATTEMPTS, createCatalogProposalsRouter } from '../../src/api/catalog/catalog-proposals.routes.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { notFound } from '../../src/middlewares/not-found.js';
import { configureAuthRbacRepository, configureAuthSessionRepository, configureAuthUserRepository } from '../../src/middlewares/require-auth.js';
import { CatalogProposalService } from '../../src/services/catalog/catalog-proposals.service.js';
import { TestSessionRepository } from '../helpers/auth-session.js';
import { startHttpTestServer } from '../helpers/http-test-server.js';

import type { CatalogProposalRepository } from '../../src/repositories/catalog/catalog-proposals.repository.interface.js';
import type { CatalogProposalType, CatalogProposalWriteResult, CreateCatalogProposalInput } from '../../src/repositories/catalog/catalog-proposals.types.js';
import type { User } from '../../src/repositories/users/user.types.js';

const now = new Date('2026-07-20T12:00:00.000Z');
const activeCommunityUser: User = {
    id: 7,
    mail: 'community@test.local',
    username: 'community',
    accountType: 'community',
    status: 'active',
    emailValidatedAt: now,
    bannedByUserId: null,
    bannedReason: null,
    bannedAt: null,
    createdAt: now,
    updatedAt: now
};
const bannedCommunityUser: User = {
    ...activeCommunityUser,
    id: 8,
    mail: 'banned@test.local',
    username: 'banned',
    status: 'banned'
};
const staffUser: User = {
    ...activeCommunityUser,
    id: 9,
    mail: 'staff@test.local',
    username: 'staff',
    accountType: 'staff'
};

class InMemoryCatalogProposalRepository implements CatalogProposalRepository {
    readonly ownedRecipes = new Set(['7:42']);
    readonly canonicalNames = new Set<string>();
    readonly pendingNames = new Set<string>();
    createCalls = 0;

    async recipeExistsForAuthor(recipeId: number, authorUserId: number): Promise<boolean> {
        return this.ownedRecipes.has(`${authorUserId}:${recipeId}`);
    }

    async activeCatalogNameExists(proposalType: CatalogProposalType, normalizedName: string): Promise<boolean> {
        return this.canonicalNames.has(`${proposalType}:${normalizedName}`);
    }

    async create(input: CreateCatalogProposalInput): Promise<CatalogProposalWriteResult> {
        this.createCalls += 1;
        const key = `${input.recipeId}:${input.proposalType}:${input.normalizedName}`;
        if (this.pendingNames.has(key))
            return { status: 'pending_duplicate' };

        this.pendingNames.add(key);
        return {
            status: 'created',
            proposal: {
                id: this.createCalls,
                ...input,
                status: 'pending',
                matchedTagId: null,
                matchedIngredientId: null,
                matchedEquipmentId: null,
                reviewedByStaffUserId: null,
                reviewReason: null,
                createdAt: now,
                reviewedAt: null
            }
        };
    }
}

async function createCatalogProposalTestApp() {
    const repository = new InMemoryCatalogProposalRepository();
    const users = new Map<number, User>([
        [activeCommunityUser.id, activeCommunityUser],
        [bannedCommunityUser.id, bannedCommunityUser],
        [staffUser.id, staffUser]
    ]);
    const sessions = new TestSessionRepository();

    configureAuthUserRepository({
        async findById(id) {
            return users.get(id) ?? null;
        }
    });
    configureAuthRbacRepository({
        async findPermissionCodesByStaffUserId() {
            return [];
        }
    });
    configureAuthSessionRepository(sessions);

    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api/v1/catalog', createCatalogProposalsRouter(createCatalogProposalsController(new CatalogProposalService(repository))));
    app.use(notFound);
    app.use(errorHandler);

    return {
        repository,
        server: await startHttpTestServer(app),
        activeCookie: await sessions.issueCookie(activeCommunityUser, 'app'),
        bannedCookie: await sessions.issueCookie(bannedCommunityUser, 'app'),
        staffCookie: await sessions.issueCookie(staffUser, 'admin')
    };
}

function postProposal(baseUrl: string, endpoint: 'tag-proposals' | 'ingredient-proposals' | 'equipment-proposals', cookie: string | undefined, body: unknown): Promise<Response> {
    return fetch(`${baseUrl}/api/v1/catalog/${endpoint}`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(cookie ? { cookie } : {})
        },
        body: JSON.stringify(body)
    });
}

describe('catalog proposal HTTP integration', () => {
    it('creates tag and ingredient proposals without mutating the recipe or canonical catalogues', async (context) => {
        const { repository, server, activeCookie } = await createCatalogProposalTestApp();
        context.after(() => server.close());

        const tagResponse = await postProposal(server.baseUrl, 'tag-proposals', activeCookie, {
            recipeId: 42,
            name: '  Cuisine---solaire  '
        });
        assert.equal(tagResponse.status, 201);
        assert.deepEqual(await tagResponse.json(), {
            id: 1,
            authorUserId: 7,
            recipeId: 42,
            proposalType: 'tag',
            proposedName: 'Cuisine---solaire',
            normalizedName: 'cuisine solaire',
            status: 'pending',
            matchedTagId: null,
            matchedIngredientId: null,
            matchedEquipmentId: null,
            reviewedByStaffUserId: null,
            reviewReason: null,
            createdAt: now.toISOString(),
            reviewedAt: null
        });

        const ingredientResponse = await postProposal(server.baseUrl, 'ingredient-proposals', activeCookie, {
            recipeId: 42,
            name: 'Poudre de lune'
        });
        assert.equal(ingredientResponse.status, 201);
        assert.equal(((await ingredientResponse.json()) as { proposalType: string }).proposalType, 'ingredient');

        const equipmentResponse = await postProposal(server.baseUrl, 'equipment-proposals', activeCookie, {
            recipeId: 42,
            name: 'Chinois futuriste'
        });
        assert.equal(equipmentResponse.status, 201);
        assert.equal(((await equipmentResponse.json()) as { proposalType: string }).proposalType, 'equipment');

        assert.deepEqual([...repository.ownedRecipes], ['7:42']);
        assert.equal(repository.canonicalNames.size, 0);
    });

    it('allows only active community sessions through the route boundary', async (context) => {
        const { repository, server, bannedCookie, staffCookie } = await createCatalogProposalTestApp();
        context.after(() => server.close());
        const body = { recipeId: 42, name: 'Community only' };

        const unauthenticated = await postProposal(server.baseUrl, 'tag-proposals', undefined, body);
        assert.equal(unauthenticated.status, 401);
        assert.equal(((await unauthenticated.json()) as { error: { code: string } }).error.code, 'AUTH_NO_TOKEN');

        const banned = await postProposal(server.baseUrl, 'tag-proposals', bannedCookie, body);
        assert.equal(banned.status, 401);
        assert.equal(((await banned.json()) as { error: { code: string } }).error.code, 'AUTH_BAD_TOKEN');

        const staff = await postProposal(server.baseUrl, 'tag-proposals', staffCookie, body);
        assert.equal(staff.status, 401);
        assert.equal(((await staff.json()) as { error: { code: string } }).error.code, 'AUTH_NO_TOKEN');
        assert.equal(repository.createCalls, 0);
    });

    it('validates ownership, payloads, canonical duplicates and pending duplicates', async (context) => {
        const { repository, server, activeCookie } = await createCatalogProposalTestApp();
        context.after(() => server.close());

        const invalid = await postProposal(server.baseUrl, 'tag-proposals', activeCookie, { recipeId: 0, name: '' });
        assert.equal(invalid.status, 400);
        assert.equal(((await invalid.json()) as { error: { code: string } }).error.code, 'CATALOG_PROPOSALS_BAD_RECIPE_ID');

        const unknownRecipe = await postProposal(server.baseUrl, 'tag-proposals', activeCookie, { recipeId: 404, name: 'Unknown recipe' });
        assert.equal(unknownRecipe.status, 404);
        assert.equal(((await unknownRecipe.json()) as { error: { code: string } }).error.code, 'CATALOG_PROPOSALS_RECIPE_NOT_FOUND');

        repository.canonicalNames.add('ingredient:sel fin');
        const canonicalDuplicate = await postProposal(server.baseUrl, 'ingredient-proposals', activeCookie, {
            recipeId: 42,
            name: 'Sel fin'
        });
        assert.equal(canonicalDuplicate.status, 409);
        assert.equal(
            ((await canonicalDuplicate.json()) as { error: { code: string } }).error.code,
            'CATALOG_PROPOSALS_CANONICAL_NAME_EXISTS'
        );

        assert.equal(
            (await postProposal(server.baseUrl, 'tag-proposals', activeCookie, { recipeId: 42, name: 'Cuisine solaire' })).status,
            201
        );
        const pendingDuplicate = await postProposal(server.baseUrl, 'tag-proposals', activeCookie, {
            recipeId: 42,
            name: 'CUISINE---SOLAIRE!!!'
        });
        assert.equal(pendingDuplicate.status, 409);
        assert.equal(((await pendingDuplicate.json()) as { error: { code: string } }).error.code, 'CATALOG_PROPOSALS_ALREADY_PENDING');
    });

    it('rate limits repeated proposal submissions before reaching the controller', async (context) => {
        const { repository, server, activeCookie } = await createCatalogProposalTestApp();
        context.after(() => server.close());

        for (let attempt = 1; attempt <= CATALOG_PROPOSALS_RATE_LIMIT_MAX_ATTEMPTS; attempt++) {
            const response = await postProposal(server.baseUrl, 'tag-proposals', activeCookie, {
                recipeId: 42,
                name: `Limited proposal ${attempt}`
            });
            assert.equal(response.status, 201);
        }

        const limited = await postProposal(server.baseUrl, 'tag-proposals', activeCookie, {
            recipeId: 42,
            name: 'Limited proposal overflow'
        });
        assert.equal(limited.status, 429);
        assert.equal(((await limited.json()) as { error: { code: string } }).error.code, 'RATE_LIMIT');
        assert.equal(limited.headers.get('ratelimit-limit'), String(CATALOG_PROPOSALS_RATE_LIMIT_MAX_ATTEMPTS));
        assert.equal(limited.headers.get('ratelimit-remaining'), '0');
        assert.ok(limited.headers.get('retry-after'));
        assert.equal(repository.createCalls, CATALOG_PROPOSALS_RATE_LIMIT_MAX_ATTEMPTS);
    });
});
