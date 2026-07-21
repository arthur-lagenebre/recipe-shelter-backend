import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';

import { adminAuthorizationPolicies } from '../../src/api/admin/admin.authorization.js';
import { createAdminCatalogProposalsController } from '../../src/api/admin/admin.catalog-proposals.controller.js';
import { createAdminCatalogProposalsRouter } from '../../src/api/admin/admin.catalog-proposals.routes.js';
import { EnforceAuthorizationPolicies } from '../../src/middlewares/authorization.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { configureAuthRbacRepository, configureAuthSessionRepository, configureAuthUserRepository, requireStaffAuth } from '../../src/middlewares/require-auth.js';
import { PERMISSIONS } from '../../src/security/permissions.js';
import { AdminCatalogProposalService } from '../../src/services/admin/admin.catalog-proposals.service.js';
import { createPaginatedResult } from '../../src/utils/pagination.js';
import { TestSessionRepository } from '../helpers/auth-session.js';
import { startHttpTestServer } from '../helpers/http-test-server.js';

import type { CatalogProposal, CatalogProposalListFilters } from '../../src/repositories/catalog/catalog-proposals.types.js';
import type { PermissionCode } from '../../src/security/permissions.js';
import type { AdminAuditRequestContext } from '../../src/services/admin/admin.audit.service.js';
import type { User } from '../../src/repositories/users/user.types.js';
import type { PaginationOptions } from '../../src/utils/pagination.js';
import type { HttpTestServer } from '../helpers/http-test-server.js';

const staff: User = {
    id: 91,
    mail: 'catalog-manager@test.local',
    username: 'catalog-manager',
    accountType: 'staff',
    status: 'active',
    emailValidatedAt: new Date('2026-07-20T10:00:00.000Z'),
    bannedByUserId: null,
    bannedReason: null,
    bannedAt: null,
    createdAt: new Date('2026-07-20T10:00:00.000Z'),
    updatedAt: new Date('2026-07-20T10:00:00.000Z')
};

const pendingProposal: CatalogProposal = {
    id: 1,
    authorUserId: 7,
    recipeId: 42,
    proposalType: 'tag',
    proposedName: 'Cuisine solaire',
    normalizedName: 'cuisine solaire',
    status: 'pending',
    matchedTagId: null,
    matchedIngredientId: null,
    matchedEquipmentId: null,
    reviewedByStaffUserId: null,
    reviewReason: null,
    createdAt: new Date('2026-07-20T10:00:00.000Z'),
    reviewedAt: null
};

class FakeAdminCatalogProposalService {
    readonly calls: Array<{ method: string; args: unknown[] }> = [];

    async list(filters: CatalogProposalListFilters, pagination: PaginationOptions, actorUserId: number, context: AdminAuditRequestContext) {
        this.calls.push({ method: 'list', args: [filters, pagination, actorUserId, context] });
        return createPaginatedResult([pendingProposal], 1, pagination);
    }

    async acceptTag(...args: unknown[]) {
        this.calls.push({ method: 'acceptTag', args });
        return reviewedProposal('accepted', { matchedTagId: 100 });
    }

    async acceptIngredient(...args: unknown[]) {
        this.calls.push({ method: 'acceptIngredient', args });
        return reviewedProposal('accepted', { matchedIngredientId: 200, proposalType: 'ingredient' });
    }

    async acceptEquipment(...args: unknown[]) {
        this.calls.push({ method: 'acceptEquipment', args });
        return reviewedProposal('accepted', { matchedEquipmentId: 400, proposalType: 'equipment' });
    }

    async reject(...args: unknown[]) {
        this.calls.push({ method: 'reject', args });
        return reviewedProposal('rejected');
    }

    async associateTag(...args: unknown[]) {
        this.calls.push({ method: 'associateTag', args });
        return reviewedProposal('merged', { matchedTagId: 10 });
    }

    async associateIngredient(...args: unknown[]) {
        this.calls.push({ method: 'associateIngredient', args });
        return reviewedProposal('merged', { matchedIngredientId: 20, proposalType: 'ingredient' });
    }

    async associateEquipment(...args: unknown[]) {
        this.calls.push({ method: 'associateEquipment', args });
        return reviewedProposal('merged', { matchedEquipmentId: 30, proposalType: 'equipment' });
    }

    async convertIngredientToAlias(...args: unknown[]) {
        this.calls.push({ method: 'convertIngredientToAlias', args });
        return reviewedProposal('merged', { matchedIngredientId: 20, proposalType: 'ingredient' });
    }
}

describe('admin catalog proposal HTTP integration', () => {
    let server: HttpTestServer;
    let cookie: string;
    let permissions: PermissionCode[] = [];
    let service: FakeAdminCatalogProposalService;

    before(async () => {
        configureAuthUserRepository({
            async findById(id) {
                return id === staff.id ? staff : null;
            }
        });
        configureAuthRbacRepository({
            async findPermissionCodesByStaffUserId() {
                return [...permissions];
            }
        });
        const sessions = new TestSessionRepository();
        configureAuthSessionRepository(sessions);
        service = new FakeAdminCatalogProposalService();

        const app = express();
        app.use(cookieParser());
        app.use(express.json());
        const adminRouter = express.Router();
        adminRouter.use(requireStaffAuth, EnforceAuthorizationPolicies(adminAuthorizationPolicies));
        adminRouter.use('/catalog-proposals', createAdminCatalogProposalsRouter(createAdminCatalogProposalsController(service as unknown as AdminCatalogProposalService)));
        app.use('/api/v1/admin', adminRouter);
        app.use(errorHandler);

        cookie = await sessions.issueCookie(staff, 'admin');
        server = await startHttpTestServer(app);
    });

    after(async () => server.close());

    it('lists the pending staff queue with parsed filters and pagination', async () => {
        permissions = [PERMISSIONS.catalogManage];
        const response = await fetch(
            `${server.baseUrl}/api/v1/admin/catalog-proposals?proposalType=tag&recipeId=42&page=2&limit=10&q=solaire`,
            { headers: { cookie, 'user-agent': 'Catalog manager integration test' } }
        );

        assert.equal(response.status, 200);
        assert.equal(((await response.json()) as { pagination: { page: number } }).pagination.page, 2);
        const call = service.calls.at(-1);
        assert.equal(call?.method, 'list');
        assert.deepEqual(call?.args[0], {
            status: 'pending',
            proposalType: 'tag',
            recipeId: 42,
            q: 'solaire'
        });
        assert.deepEqual(call?.args[1], { page: 2, limit: 10, offset: 10 });
        assert.equal(call?.args[2], staff.id);
    });

    it('requires catalog management and tag creation before accepting a tag', async () => {
        const url = `${server.baseUrl}/api/v1/admin/catalog-proposals/tags/1/accept`;
        const body = JSON.stringify({
            groupId: 8,
            name: 'Free canonical name must be ignored',
            reason: 'Proposition validée par le catalogue.'
        });

        for (const incompletePermissions of [[PERMISSIONS.catalogManage], [PERMISSIONS.tagCreate]]) {
            permissions = incompletePermissions;
            const denied = await fetch(url, {
                method: 'POST',
                headers: { cookie, 'content-type': 'application/json' },
                body
            });
            assert.equal(denied.status, 403);
        }

        permissions = [PERMISSIONS.catalogManage, PERMISSIONS.tagCreate];
        const accepted = await fetch(url, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body
        });

        assert.equal(accepted.status, 201);
        assert.equal(((await accepted.json()) as { status: string }).status, 'accepted');
        const call = service.calls.at(-1);
        assert.equal(call?.method, 'acceptTag');
        assert.deepEqual(call?.args[1], {
            groupId: 8,
            reason: 'Proposition validée par le catalogue.'
        });
    });

    it('requires catalog management and equipment creation before accepting an equipment', async () => {
        const url = `${server.baseUrl}/api/v1/admin/catalog-proposals/equipments/5/accept`;
        const body = JSON.stringify({
            name: 'Free canonical name must be ignored',
            reason: 'Proposition validée par le catalogue.'
        });

        for (const incompletePermissions of [[PERMISSIONS.catalogManage], [PERMISSIONS.equipmentCreate]]) {
            permissions = incompletePermissions;
            const denied = await fetch(url, {
                method: 'POST',
                headers: { cookie, 'content-type': 'application/json' },
                body
            });
            assert.equal(denied.status, 403);
        }

        permissions = [PERMISSIONS.catalogManage, PERMISSIONS.equipmentCreate];
        const accepted = await fetch(url, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body
        });

        assert.equal(accepted.status, 201);
        assert.equal(((await accepted.json()) as { status: string }).status, 'accepted');
        const call = service.calls.at(-1);
        assert.equal(call?.method, 'acceptEquipment');
        assert.deepEqual(call?.args[1], {
            reason: 'Proposition validée par le catalogue.'
        });
    });

    it('associates an equipment proposal to an existing target under catalog management alone', async () => {
        permissions = [PERMISSIONS.catalogManage];
        const response = await fetch(`${server.baseUrl}/api/v1/admin/catalog-proposals/equipments/6/associate`, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                targetEquipmentId: 30,
                reason: 'Correspond à un ustensile déjà présent.'
            })
        });

        assert.equal(response.status, 200);
        assert.equal(((await response.json()) as { status: string }).status, 'merged');
        const call = service.calls.at(-1);
        assert.equal(call?.method, 'associateEquipment');
        assert.deepEqual(call?.args[1], {
            targetEquipmentId: 30,
            reason: 'Correspond à un ustensile déjà présent.'
        });
    });

    it('validates a mandatory rejection reason before invoking the service', async () => {
        permissions = [PERMISSIONS.catalogManage];
        const callsBefore = service.calls.length;
        const invalid = await fetch(`${server.baseUrl}/api/v1/admin/catalog-proposals/1/reject`, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ reason: 'court' })
        });

        assert.equal(invalid.status, 400);
        assert.equal(((await invalid.json()) as { error: { code: string } }).error.code, 'ADMIN_CATALOG_PROPOSALS_REJECT_REASON_TOO_SHORT');
        assert.equal(service.calls.length, callsBefore);

        const rejected = await fetch(`${server.baseUrl}/api/v1/admin/catalog-proposals/1/reject`, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ reason: 'Suggestion hors périmètre.' })
        });
        assert.equal(rejected.status, 200);
        assert.equal(((await rejected.json()) as { status: string }).status, 'rejected');
    });

    it('requires alias management and returns the reviewed ingredient proposal', async () => {
        permissions = [PERMISSIONS.catalogManage, PERMISSIONS.ingredientAliasManage];
        const response = await fetch(`${server.baseUrl}/api/v1/admin/catalog-proposals/ingredients/2/alias`, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                targetIngredientId: 20,
                languageCode: 'FR',
                reason: 'Variante utile comme alias français.'
            })
        });

        assert.equal(response.status, 201);
        assert.equal(((await response.json()) as { status: string }).status, 'merged');
        const call = service.calls.at(-1);
        assert.equal(call?.method, 'convertIngredientToAlias');
        assert.deepEqual(call?.args[1], {
            targetIngredientId: 20,
            languageCode: 'fr',
            reason: 'Variante utile comme alias français.'
        });
    });
});

function reviewedProposal(status: CatalogProposal['status'], overrides: Partial<CatalogProposal> = {}): CatalogProposal {
    return {
        ...pendingProposal,
        status,
        reviewedByStaffUserId: staff.id,
        reviewReason: 'Motif de revue suffisamment long.',
        reviewedAt: new Date('2026-07-20T11:00:00.000Z'),
        ...overrides
    };
}
