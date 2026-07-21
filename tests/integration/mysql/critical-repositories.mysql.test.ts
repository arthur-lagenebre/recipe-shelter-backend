import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import mysql from 'mysql2/promise';

import { AdminCommentRepositoryMysql } from '../../../src/repositories/admin/admin.comments.repository.mysql.js';
import { AdminAuditRepositoryMysql } from '../../../src/repositories/admin/admin.audit.repository.mysql.js';
import { AdminRecipeRepositoryMysql } from '../../../src/repositories/admin/admin.recipe.repository.mysql.js';
import { AdminUserRepositoryMysql } from '../../../src/repositories/admin/admin.users.repository.mysql.js';
import { CommentRepositoryMysql } from '../../../src/repositories/comment/comment.repository.mysql.js';
import { FavoriteRepositoryMysql } from '../../../src/repositories/favorite/favorite.repository.mysql.js';
import { RecipeRepositoryMysql } from '../../../src/repositories/recipes/recipe.repository.mysql.js';
import { RbacRepositoryMysql } from '../../../src/repositories/rbac/rbac.repository.mysql.js';
import { UserRepositoryMysql } from '../../../src/repositories/users/user.repository.mysql.js';
import { AdminAuditActionRunnerMysql } from '../../../src/services/admin/admin.audit-action.runner.js';
import { AdminAuditService } from '../../../src/services/admin/admin.audit.service.js';
import { AdminCommentService } from '../../../src/services/admin/admin.comments.service.js';
import { AdminRecipeService } from '../../../src/services/admin/admin.recipes.service.js';
import { AdminUserService } from '../../../src/services/admin/admin.users.service.js';
import { env } from '../../../src/utils/env.js';

import type { Pool } from 'mysql2/promise';

const testDatabaseName = process.env.TEST_DB_NAME?.trim() ?? '';
const mysqlEnabled = Boolean(testDatabaseName);

function requireSafeTestDatabaseName(): string {
    if (!/^[a-zA-Z0-9_]+$/.test(testDatabaseName))
        throw new Error('TEST_DB_NAME must contain only letters, numbers and underscores');
    if (!testDatabaseName.toLowerCase().includes('test'))
        throw new Error('TEST_DB_NAME must contain "test"');
    if (testDatabaseName === env.db.name)
        throw new Error('TEST_DB_NAME must be different from DB_NAME');
    return testDatabaseName;
}

describe('critical MySQL repositories integration', { skip: !mysqlEnabled && 'Set TEST_DB_NAME to run isolated MySQL tests' }, () => {
    let adminConnection: mysql.Connection;
    let pool: Pool;

    before(async () => {
        const databaseName = requireSafeTestDatabaseName();
        adminConnection = await mysql.createConnection({
            host: env.db.host,
            port: env.db.port,
            user: env.db.user,
            password: env.db.password,
            multipleStatements: true
        });

        await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
        await adminConnection.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

        const schemaPath = new URL('../../../database/migrations/1_create_schema.sql', import.meta.url);
        const schema = (await readFile(schemaPath, 'utf8')).replace(/USE\s+recipe_shelter\s*;/i, `USE \`${databaseName}\`;`);
        await adminConnection.query(schema);

        await adminConnection.query(`
            USE \`${databaseName}\`;
            INSERT INTO Roles (Id, Code, Name, Description) VALUES
                (1, 'SuperAdmin', 'administrator', 'Full access'),
                (2, 'RecipeModerator', 'moderator', 'Moderation access');
            INSERT INTO Permissions (Id, Code, Description) VALUES
                (1, 'user.read', 'Read users'),
                (2, 'user.ban', 'Ban users'),
                (3, 'user.unban', 'Unban users'),
                (4, 'recipe.review', 'Review recipes'),
                (5, 'recipe.publish', 'Publish recipes'),
                (6, 'recipe.reject', 'Reject recipes'),
                (7, 'recipe.archive', 'Archive recipes');
            INSERT INTO RolePermissions (RoleId, PermissionId) VALUES
                (1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7),
                (2, 4), (2, 5), (2, 6), (2, 7);
            INSERT INTO Users (Id, Mail, Username, Password, AccountType, Status, EmailValidatedAt, BannedByUserId, BannedReason, BannedAt) VALUES
                (1, 'admin@test.local', 'admin', 'hash', 'staff', 'inactive', CURRENT_TIMESTAMP, NULL, NULL, NULL),
                (2, 'reader@test.local', 'reader', 'hash', 'community', 'active', CURRENT_TIMESTAMP, NULL, NULL, NULL),
                (3, 'locked-staff@test.local', 'locked-staff', 'hash', 'staff', 'banned', CURRENT_TIMESTAMP, NULL, NULL, NULL),
                (4, 'banned-community@test.local', 'banned-community', 'hash', 'community', 'banned', CURRENT_TIMESTAMP, 1, 'Pre-migration moderation', CURRENT_TIMESTAMP);
            INSERT INTO StaffWebAuthnCredentials
                (CredentialId, StaffUserId, PublicKey, SignatureCounter, DeviceType, BackedUp, Aaguid)
            VALUES ('critical-admin-credential', 1, 0x0102, 0, 'singleDevice', FALSE, '00000000-0000-0000-0000-000000000000');
            UPDATE StaffProfiles
            SET MfaEnrolledAt = CURRENT_TIMESTAMP
            WHERE UserId = 1;
            UPDATE Users SET Status = 'active' WHERE Id = 1;
            INSERT INTO StaffRoles (StaffUserId, RoleId) VALUES (1, 1);
        `);

        pool = mysql.createPool({
            host: env.db.host,
            port: env.db.port,
            user: env.db.user,
            password: env.db.password,
            database: databaseName,
            connectionLimit: 3,
            timezone: 'Z',
            multipleStatements: true
        });

        await pool.query(`
            INSERT INTO RecipeCategories (Id, Name, Slug, IconName) VALUES
                (1, 'Main', 'main', 'dish'),
                (2, 'Search fixtures', 'search-fixtures', 'search');
            INSERT INTO Ingredients (Id, Name, NormalizedName, Slug) VALUES
                (1, 'Pasta', 'pasta', 'pasta'),
                (10, 'Search base', 'search base', 'search-base'),
                (11, 'Search required', 'search required', 'search-required'),
                (12, 'Search blocked', 'search blocked', 'search-blocked'),
                (13, 'Search other blocked', 'search other blocked', 'search-other-blocked');
            INSERT INTO Equipments (Id, Name, NormalizedName, Slug) VALUES (1, 'Pot', 'pot', 'pot');
            INSERT INTO TagGroups (Id, Name, Slug, SortOrder) VALUES (1, 'Time', 'time', 1);
            INSERT INTO Tags (Id, GroupId, Name, NormalizedName, Slug) VALUES
                (1, 1, 'Quick', 'quick', 'quick'),
                (10, 1, 'Search base', 'search base', 'search-base'),
                (11, 1, 'Search required', 'search required', 'search-required'),
                (12, 1, 'Search blocked', 'search blocked', 'search-blocked'),
                (13, 1, 'Search other blocked', 'search other blocked', 'search-other-blocked');

            INSERT INTO Recipes (Id, UserId, CategoryId, Title, Slug, Description, PrepTimeMinutes, RestTimeMinutes, CookTimeMinutes, Servings, Status, PublishedAt) VALUES
                (100, 2, 2, 'Filterfixture alpha', 'filterfixture-alpha', 'Search fixture', 5, NULL, 5, 2, 'published', '2026-07-07 10:00:00'),
                (101, 2, 2, 'Filterfixture beta', 'filterfixture-beta', 'Search fixture', 10, NULL, 10, 2, 'published', '2026-07-06 10:00:00'),
                (102, 2, 2, 'Filterfixture gamma', 'filterfixture-gamma', 'Search fixture', 10, 5, 15, 2, 'published', '2026-07-05 10:00:00'),
                (103, 2, 1, 'Filterfixture delta', 'filterfixture-delta', 'Search fixture', 5, NULL, 10, 2, 'published', '2026-07-04 10:00:00'),
                (104, 2, 2, 'Filterfixture epsilon', 'filterfixture-epsilon', 'Search fixture', 20, 20, 30, 2, 'published', '2026-07-03 10:00:00'),
                (105, 2, 2, 'Filterfixture draft', 'filterfixture-draft', 'Search fixture', 5, NULL, 5, 2, 'draft', NULL),
                (106, 2, 1, 'Filterfixture duplicate ingredient', 'filterfixture-duplicate-ingredient', 'Search fixture', 6, NULL, 6, 2, 'published', '2026-07-02 10:00:00');

            INSERT INTO RecipeTags (RecipeId, TagId) VALUES
                (100, 10), (100, 11),
                (101, 10), (101, 11), (101, 12),
                (102, 10), (102, 11), (102, 13),
                (103, 10),
                (104, 10), (104, 11),
                (105, 10), (105, 11),
                (106, 10);

            INSERT INTO RecipeIngredients (RecipeId, IngredientId, DisplayText, Quantity, SortOrder) VALUES
                (100, 10, 'base finement émincée', 1, 1), (100, 11, 'élément requis', 1, 2),
                (101, 10, 'base', 1, 1), (101, 11, 'requis', 1, 2), (101, 12, 'élément bloquant', 1, 3),
                (102, 10, 'base', 1, 1), (102, 11, 'requis', 1, 2), (102, 13, 'autre élément bloquant', 1, 3),
                (103, 10, 'base', 1, 1),
                (104, 10, 'base', 1, 1), (104, 11, 'requis', 1, 2),
                (105, 10, 'base', 1, 1), (105, 11, 'requis', 1, 2),
                (106, 10, 'première base', 1, 1), (106, 10, 'seconde base', 2, 2);
        `);
    });

    after(async () => {
        if (pool)
            await pool.end();
        if (adminConnection) {
            await adminConnection.query(`DROP DATABASE IF EXISTS \`${requireSafeTestDatabaseName()}\``);
            await adminConnection.end();
        }
    });

    it('persists the critical user, recipe, favorite and comment flow with transactions', async () => {
        const users = new UserRepositoryMysql(pool);
        const rbac = new RbacRepositoryMysql(pool);
        const recipes = new RecipeRepositoryMysql(pool);
        const favorites = new FavoriteRepositoryMysql(pool);
        const comments = new CommentRepositoryMysql(pool);
        const adminUsers = new AdminUserRepositoryMysql(pool);
        const adminRecipes = new AdminRecipeRepositoryMysql(pool);
        const adminComments = new AdminCommentRepositoryMysql(pool);
        const auditActions = new AdminAuditActionRunnerMysql(pool, (db) => new AdminAuditService(new AdminAuditRepositoryMysql(db)));
        const adminUserService = new AdminUserService(users, adminUsers, auditActions);
        const adminRecipeService = new AdminRecipeService(adminRecipes, auditActions);
        const adminCommentService = new AdminCommentService(adminComments, auditActions);

        const [accountTypeColumns] = await pool.query(`SHOW COLUMNS FROM Users WHERE Field = 'AccountType'`);
        const accountTypeColumn = (accountTypeColumns as Array<{ Type: string; Null: string; Default: string }>)[0];
        assert.deepEqual(
            accountTypeColumn && {
                type: accountTypeColumn.Type,
                nullable: accountTypeColumn.Null,
                defaultValue: accountTypeColumn.Default
            },
            {
                type: "enum('community','staff')",
                nullable: 'NO',
                defaultValue: 'community'
            }
        );
        const [staffStatusColumns] = await pool.query(`SHOW COLUMNS FROM StaffProfiles WHERE Field = 'Status'`);
        assert.equal((staffStatusColumns as Array<{ Type: string }>)[0]?.Type, "enum('invited','active','locked','disabled')");
        assert.equal((await users.findById(1))?.accountType, 'staff');
        assert.equal((await users.findById(1))?.status, 'active');
        assert.equal((await users.findById(2))?.accountType, 'community');
        assert.equal((await users.findById(3))?.status, 'locked');
        assert.equal((await users.findById(4))?.status, 'banned');
        assert.equal((await users.findById(4))?.bannedReason, 'Pre-migration moderation');
        assert.equal(await users.findCommunityProfileByUserId(1), null);
        assert.equal((await users.findStaffProfileByUserId(1))?.status, 'active');
        assert.equal(await users.findStaffProfileByUserId(2), null);
        assert.equal((await users.findCommunityProfileByUserId(2))?.status, 'active');

        await assert.rejects(() => pool.query(`INSERT INTO CommunityProfiles (UserId, AccountType, Status) VALUES (1, 'community', 'active')`));
        assert.equal(await users.findCommunityProfileByUserId(1), null);

        const [legacyInsert] = await pool.query(`INSERT INTO Users (Mail, Username, Password, AccountType, Status) VALUES ('rolling-community@test.local', 'rolling-community', 'hash', 'community', 'inactive')`);
        const rollingCommunityId = Number((legacyInsert as { insertId: number }).insertId);
        assert.equal((await users.findCommunityProfileByUserId(rollingCommunityId))?.status, 'inactive');
        await pool.query(`UPDATE Users SET Status = 'banned', BannedByUserId = 1, BannedReason = 'Rolling deployment moderation', BannedAt = CURRENT_TIMESTAMP WHERE Id = ?`, [rollingCommunityId]);
        assert.equal((await users.findCommunityProfileByUserId(rollingCommunityId))?.status, 'banned');
        const staff = await users.create({
            mail: 'staff@test.local',
            username: 'staff',
            passwordHash: 'password-hash',
            accountType: 'staff',
            status: 'invited'
        });
        assert.equal(staff.accountType, 'staff');
        assert.equal(await users.findCommunityProfileByUserId(staff.id), null);
        assert.equal((await users.findStaffProfileByUserId(staff.id))?.status, 'invited');
        assert.deepEqual(await rbac.findPermissionCodesByStaffUserId(staff.id), []);

        await pool.query(`INSERT INTO StaffRoles (StaffUserId, RoleId) VALUES (?, 1), (?, 2)`, [staff.id, staff.id]);
        assert.deepEqual(await rbac.findPermissionCodesByStaffUserId(staff.id), [
            'recipe.archive',
            'recipe.publish',
            'recipe.reject',
            'recipe.review',
            'user.ban',
            'user.read',
            'user.unban'
        ]);
        await assert.rejects(() => pool.query(`INSERT INTO StaffRoles (StaffUserId, RoleId) VALUES (?, 1)`, [staff.id]));
        await assert.rejects(() => pool.query(`INSERT INTO StaffRoles (StaffUserId, RoleId) VALUES (2, 1)`));
        await assert.rejects(() => pool.query(`INSERT INTO StaffRoles (StaffUserId, RoleId) VALUES (?, 999999)`, [staff.id]));
        await assert.rejects(() => pool.query(`INSERT INTO RolePermissions (RoleId, PermissionId) VALUES (1, 1)`));
        await assert.rejects(() => pool.query(`INSERT INTO RolePermissions (RoleId, PermissionId) VALUES (1, 999999)`));
        await assert.rejects(() => pool.query(`INSERT INTO Roles (Code, Name, Description) VALUES ('SUPERADMIN', 'Other administrator', 'Duplicate')`));
        await assert.rejects(() => pool.query(`INSERT INTO Permissions (Code, Description) VALUES ('USER.READ', 'Duplicate')`));
        const author = await users.create({
            mail: 'author@test.local',
            username: 'author',
            passwordHash: 'password-hash',
            accountType: 'community',
            status: 'active'
        });
        assert.equal(author.accountType, 'community');
        assert.equal(await users.isEmailTaken('author@test.local'), true);
        assert.equal((await users.findAuthByEmail('author@test.local'))?.passwordHash, 'password-hash');
        assert.equal(await adminUserService.ban(author.id, 1, 'Repository integration ban.', {}), true);
        assert.equal((await users.findById(author.id))?.status, 'banned');
        assert.equal(await adminUserService.unban(author.id, 1, 'Repository integration unban.', {}), true);
        assert.equal((await users.findById(author.id))?.status, 'active');
        assert.equal((await adminUsers.findModerationLogsByUserId(author.id)).length, 2);

        const recipe = await recipes.create({
            userId: author.id,
            categoryId: 1,
            title: 'Quick pasta',
            slug: 'draft-quick-pasta',
            description: 'A repository integration recipe',
            prepTimeMinutes: 5,
            cookTimeMinutes: 10,
            servings: 2,
            tagIds: [1],
            ingredients: [
                { ingredientId: 1, displayText: 'pâtes fraîches maison', quantity: 200, unit: 'g', note: null, sortOrder: 1 },
                { ingredientId: 10, displayText: 'base aromatique au goût', note: 'to taste', sortOrder: 2 }
            ],
            steps: [{ stepNumber: 1, description: 'Cook the pasta.' }],
            equipments: [{ equipmentId: 1 }]
        });
        assert.equal(recipe.ingredients[0]?.quantity, 200);
        assert.equal(recipe.ingredients[0]?.displayText, 'pâtes fraîches maison');
        assert.equal(recipe.ingredients[1]?.quantity, null);
        assert.deepEqual(recipe.tagIds, [1]);
        assert.deepEqual(recipe.equipments, [{ equipmentId: 1 }]);

        const updatedRecipe = await recipes.updateDraft({
            id: recipe.id,
            userId: author.id,
            title: recipe.title,
            slug: recipe.slug,
            ingredients: [
                {
                    ingredientId: 1,
                    displayText: 'pâtes fraîches maison, finement coupées',
                    quantity: 200,
                    unit: 'g',
                    note: null,
                    sortOrder: 1
                },
                { ingredientId: 10, displayText: 'base aromatique au goût', note: 'to taste', sortOrder: 2 }
            ]
        });
        assert.equal(updatedRecipe.ingredients[0]?.displayText, 'pâtes fraîches maison, finement coupées');

        const submitted = await recipes.submit(recipe.id, 'quick-pasta');
        assert.equal(submitted.status, 'pending');
        assert.equal(await adminRecipeService.reject(recipe.id, 1, 'Missing editorial details.', {}), true);
        const rejectedRecipe = await adminRecipes.findByIdForAdmin(recipe.id);
        assert.equal(rejectedRecipe?.status, 'rejected');
        assert.equal(rejectedRecipe?.rejectionReason, 'Missing editorial details.');
        assert.equal(rejectedRecipe?.ingredients[0]?.displayText, 'pâtes fraîches maison, finement coupées');
        assert.equal((await recipes.submit(recipe.id, 'quick-pasta')).status, 'pending');
        assert.equal(await adminRecipes.publish(recipe.id, 1), true);

        const published = await recipes.searchPublished(author.id, { q: 'pasta' }, { page: 1, limit: 12, offset: 0 });
        assert.equal(published.items[0]?.slug, 'quick-pasta');
        const detail = await recipes.findPublishedBySlug(author.id, 'quick-pasta');
        assert.equal(detail?.ingredients[0]?.name, 'Pasta');
        assert.equal(detail?.ingredients[0]?.displayText, 'pâtes fraîches maison, finement coupées');
        assert.equal(detail?.steps[0]?.description, 'Cook the pasta.');

        const favorite = await favorites.create(2, recipe.id);
        assert.equal(favorite.recipeId, recipe.id);
        const favoriteRecipes = await favorites.getFavoriteRecipes(2, { page: 1, limit: 12, offset: 0 });
        assert.equal(favoriteRecipes.items[0]?.isFavorite, true);

        const rootComment = await comments.create({
            recipeId: recipe.id,
            userId: 2,
            rating: 5,
            comment: 'Tested with the real repository.'
        });
        const reply = await comments.create({
            recipeId: recipe.id,
            userId: author.id,
            parentCommentId: rootComment.id,
            comment: 'Thanks for testing it.'
        });
        const commentTree = await comments.findByRecipeId(recipe.id);
        assert.equal(commentTree.length, 1);
        assert.equal(commentTree[0]?.children?.[0]?.id, reply.id);

        await assert.rejects(() => adminComments.hide(rootComment.id, 1, 'short'));
        assert.equal(await adminCommentService.hide(rootComment.id, 1, 'Repeated personal attacks.', {}), true);
        const moderatedComments = await adminComments.findModeratedForAdmin();
        assert.equal(moderatedComments.length, 1);
        assert.equal(moderatedComments[0]?.moderationReason, 'Repeated personal attacks.');
        const [commentModerationLogs] = await pool.query(`SELECT audit.Action, audit.Reason FROM CommentModerationLogs AS log INNER JOIN AdminAuditLogs AS audit ON audit.Id = log.AdminAuditLogId WHERE log.CommentId = ?`, [rootComment.id]);
        assert.deepEqual(commentModerationLogs, [{ Action: 'comments.hide', Reason: 'Repeated personal attacks.' }]);
        assert.equal(await adminComments.unmoderate(rootComment.id), true);
        assert.equal((await adminComments.findByIdForAdmin(rootComment.id))?.moderationReason, null);

        assert.equal(await comments.softDelete(reply.id, author.id), true);
        assert.equal(await adminComments.restore(reply.id), true);
        assert.equal(await favorites.delete(2, recipe.id), true);

        await assert.rejects(() => adminRecipes.archive(recipe.id, 1, 'short'));
        assert.equal(await adminRecipeService.archive(recipe.id, 1, 'Editorial policy violation.', {}), true);
        const archivedRecipe = await adminRecipes.findByIdForAdmin(recipe.id);
        assert.equal(archivedRecipe?.status, 'archived');
        assert.equal(archivedRecipe?.archiveReason, 'Editorial policy violation.');
        const [recipeModerationLogs] = await pool.query(`SELECT audit.Action, audit.Reason FROM RecipeModerationLogs AS log INNER JOIN AdminAuditLogs AS audit ON audit.Id = log.AdminAuditLogId WHERE log.RecipeId = ? ORDER BY audit.Id`, [recipe.id]);
        assert.deepEqual(recipeModerationLogs, [
            { Action: 'recipes.reject', Reason: 'Missing editorial details.' },
            { Action: 'recipes.archive', Reason: 'Editorial policy violation.' }
        ]);

        await assert.rejects(() =>
            recipes.create({
                userId: author.id,
                title: 'Rollback recipe',
                slug: 'rollback-recipe',
                ingredients: [{ ingredientId: 999_999, displayText: 'ingrédient inconnu', quantity: 1 }]
            })
        );
        assert.equal(await recipes.existsBySlug('rollback-recipe'), false);
    });

    it('searches published recipes with inclusive and exclusive tag and ingredient filters', async () => {
        const recipes = new RecipeRepositoryMysql(pool);
        const pagination = { page: 1, limit: 50, offset: 0 };
        const fixtureQuery = { q: 'filterfixture' };
        const ids = (result: Awaited<ReturnType<RecipeRepositoryMysql['searchPublished']>>) => result.items.map((item) => item.id);

        const inclusions = await recipes.searchPublished(
            null,
            {
                ...fixtureQuery,
                tagIds: [10, 11],
                ingredientIds: [10, 11]
            },
            pagination
        );
        assert.deepEqual(ids(inclusions), [100, 101, 102, 104]);
        assert.equal(inclusions.pagination.totalItems, 4);
        assert.ok(!ids(inclusions).includes(105), 'draft recipes must not be returned');

        const excludedByTag = await recipes.searchPublished(
            null,
            {
                ...fixtureQuery,
                excludedTagIds: [12]
            },
            pagination
        );
        assert.deepEqual(ids(excludedByTag), [100, 102, 103, 104, 106]);

        const excludedByIngredient = await recipes.searchPublished(
            null,
            {
                ...fixtureQuery,
                excludedIngredientIds: [12]
            },
            pagination
        );
        assert.deepEqual(ids(excludedByIngredient), [100, 102, 103, 104, 106]);

        const includedAndExcluded = await recipes.searchPublished(
            null,
            {
                ...fixtureQuery,
                tagIds: [10, 11],
                excludedTagIds: [12],
                ingredientIds: [10, 11],
                excludedIngredientIds: [12]
            },
            pagination
        );
        assert.deepEqual(ids(includedAndExcluded), [100, 102, 104]);

        const severalExclusions = await recipes.searchPublished(
            null,
            {
                ...fixtureQuery,
                excludedTagIds: [12, 999_999]
            },
            pagination
        );
        assert.deepEqual(ids(severalExclusions), [100, 102, 103, 104, 106]);

        const unknownExclusion = await recipes.searchPublished(
            null,
            {
                ...fixtureQuery,
                excludedTagIds: [999_999],
                excludedIngredientIds: [999_999]
            },
            pagination
        );
        assert.deepEqual(ids(unknownExclusion), [100, 101, 102, 103, 104, 106]);

        const unknownInclusion = await recipes.searchPublished(
            null,
            {
                ...fixtureQuery,
                tagIds: [999_999]
            },
            pagination
        );
        assert.deepEqual(ids(unknownInclusion), []);
        assert.equal(unknownInclusion.pagination.totalItems, 0);

        const combinedFilters = await recipes.searchPublished(
            null,
            {
                ...fixtureQuery,
                categoryId: 2,
                excludedTagIds: [12],
                maxTotalTimeMinutes: 25
            },
            pagination
        );
        assert.deepEqual(ids(combinedFilters), [100]);

        const exactPage = await recipes.searchPublished(
            null,
            {
                ...fixtureQuery,
                tagIds: [10],
                excludedTagIds: [12]
            },
            { page: 1, limit: 2, offset: 0 }
        );
        assert.deepEqual(ids(exactPage), [100, 102]);
        assert.deepEqual(exactPage.pagination, {
            page: 1,
            limit: 2,
            totalItems: 5,
            totalPages: 3,
            hasNextPage: true,
            hasPreviousPage: false
        });

        const duplicateIngredientRows = await recipes.searchPublished(
            null,
            {
                ...fixtureQuery,
                ingredientIds: [10]
            },
            pagination
        );
        assert.equal(duplicateIngredientRows.items.length, 6);
        assert.equal(new Set(ids(duplicateIngredientRows)).size, duplicateIngredientRows.items.length);
        assert.equal(duplicateIngredientRows.pagination.totalItems, 6);
    });

    it('keeps linked community content after specialized profile state changes', async () => {
        await pool.query(`UPDATE StaffProfiles SET Status = 'disabled', DisabledByStaffUserId = 3, DisabledReason = 'MySQL specialized profile lifecycle test', DisabledAt = CURRENT_TIMESTAMP WHERE UserId = 3`);

        const [profileTables] = await pool.query(`SELECT TABLE_NAME AS TableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('CommunityProfiles', 'StaffProfiles') ORDER BY TABLE_NAME`, [requireSafeTestDatabaseName()]);
        assert.deepEqual(
            (profileTables as Array<{ TableName: string }>).map((row) => row.TableName.toLowerCase()),
            ['communityprofiles', 'staffprofiles']
        );

        const [profileStatuses] = await pool.query(`SELECT u.Id, COALESCE(cp.Status, sp.Status) AS Status FROM Users AS u LEFT JOIN CommunityProfiles AS cp ON cp.UserId = u.Id LEFT JOIN StaffProfiles AS sp ON sp.UserId = u.Id WHERE u.Id IN (2, 3, 4) ORDER BY u.Id`);
        assert.deepEqual(profileStatuses, [
            { Id: 2, Status: 'active' },
            { Id: 3, Status: 'disabled' },
            { Id: 4, Status: 'banned' }
        ]);

        const [contentCounts] = await pool.query(`SELECT (SELECT COUNT(*) FROM Recipes) AS RecipesCount, (SELECT COUNT(*) FROM Comments) AS CommentsCount, (SELECT COUNT(*) FROM Favorites) AS FavoritesCount`);
        assert.deepEqual(contentCounts, [{ RecipesCount: 8, CommentsCount: 2, FavoritesCount: 0 }]);
    });
});
