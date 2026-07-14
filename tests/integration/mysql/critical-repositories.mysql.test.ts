import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import mysql from 'mysql2/promise';

import { AdminCommentRepositoryMysql } from '../../../src/repositories/admin/admin.comments.repository.mysql.js';
import { AdminRecipeRepositoryMysql } from '../../../src/repositories/admin/admin.recipe.repository.mysql.js';
import { AdminUserRepositoryMysql } from '../../../src/repositories/admin/admin.users.repository.mysql.js';
import { CommentRepositoryMysql } from '../../../src/repositories/comments/comments.repository.mysql.js';
import { FavoriteRepositoryMysql } from '../../../src/repositories/favorites/favorites.repository.mysql.js';
import { RecipeRepositoryMysql } from '../../../src/repositories/recipes/recipe.repository.mysql.js';
import { UserRepositoryMysql } from '../../../src/repositories/users/user.repository.mysql.js';
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
        await adminConnection.query(
            `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );

        const schemaPath = new URL('../../../database/migrations/1_create_schema.sql', import.meta.url);
        const schema = (await readFile(schemaPath, 'utf8'))
            .replace(/USE\s+recipe_shelter\s*;/i, `USE \`${databaseName}\`;`);
        await adminConnection.query(schema);

        // Return the freshly-created unified schema to its B1.1 shape so the
        // production deployment script is tested against real existing accounts.
        const initialRollbackPath = new URL('../../../database/deploy/b1_2_community_staff_profiles.rollback.sql', import.meta.url);
        const initialRollback = (await readFile(initialRollbackPath, 'utf8'))
            .replace(/USE\s+recipe_shelter\s*;/i, `USE \`${databaseName}\`;`);
        await adminConnection.query(initialRollback);

        await adminConnection.query(`
            USE \`${databaseName}\`;
            INSERT INTO Roles (Id, Name) VALUES (1, 'admin'), (2, 'user');
            INSERT INTO Users (Id, Mail, Username, Password, RoleId, AccountType, Status, EmailValidatedAt, BannedByUserId, BannedReason, BannedAt) VALUES
                (1, 'admin@test.local', 'admin', 'hash', 1, 'staff', 'active', CURRENT_TIMESTAMP, NULL, NULL, NULL),
                (2, 'reader@test.local', 'reader', 'hash', 2, 'community', 'active', CURRENT_TIMESTAMP, NULL, NULL, NULL),
                (3, 'locked-staff@test.local', 'locked-staff', 'hash', 1, 'staff', 'banned', CURRENT_TIMESTAMP, NULL, NULL, NULL),
                (4, 'banned-community@test.local', 'banned-community', 'hash', 2, 'community', 'banned', CURRENT_TIMESTAMP, 1, 'Pre-migration moderation', CURRENT_TIMESTAMP);
        `);

        const profileMigrationPath = new URL('../../../database/deploy/b1_2_community_staff_profiles.sql', import.meta.url);
        const profileMigration = (await readFile(profileMigrationPath, 'utf8'))
            .replace(/USE\s+recipe_shelter\s*;/i, `USE \`${databaseName}\`;`);
        await adminConnection.query(profileMigration);

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
            INSERT INTO Ingredients (Id, Name, Slug) VALUES
                (1, 'Pasta', 'pasta'),
                (10, 'Search base', 'search-base'),
                (11, 'Search required', 'search-required'),
                (12, 'Search blocked', 'search-blocked'),
                (13, 'Search other blocked', 'search-other-blocked');
            INSERT INTO Equipments (Id, Name, Slug) VALUES (1, 'Pot', 'pot');
            INSERT INTO TagGroups (Id, Name, Slug, SortOrder) VALUES (1, 'Time', 'time', 1);
            INSERT INTO Tags (Id, GroupId, Name, Slug) VALUES
                (1, 1, 'Quick', 'quick'),
                (10, 1, 'Search base', 'search-base'),
                (11, 1, 'Search required', 'search-required'),
                (12, 1, 'Search blocked', 'search-blocked'),
                (13, 1, 'Search other blocked', 'search-other-blocked');

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

            INSERT INTO RecipeIngredients (RecipeId, IngredientId, Quantity, SortOrder) VALUES
                (100, 10, 1, 1), (100, 11, 1, 2),
                (101, 10, 1, 1), (101, 11, 1, 2), (101, 12, 1, 3),
                (102, 10, 1, 1), (102, 11, 1, 2), (102, 13, 1, 3),
                (103, 10, 1, 1),
                (104, 10, 1, 1), (104, 11, 1, 2),
                (105, 10, 1, 1), (105, 11, 1, 2),
                (106, 10, 1, 1), (106, 10, 2, 2);
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
        const recipes = new RecipeRepositoryMysql(pool);
        const favorites = new FavoriteRepositoryMysql(pool);
        const comments = new CommentRepositoryMysql(pool);
        const adminUsers = new AdminUserRepositoryMysql(pool);
        const adminRecipes = new AdminRecipeRepositoryMysql(pool);
        const adminComments = new AdminCommentRepositoryMysql(pool);

        const [accountTypeColumns] = await pool.query(`SHOW COLUMNS FROM Users WHERE Field = 'AccountType'`);
        const accountTypeColumn = (accountTypeColumns as Array<{ Type: string; Null: string; Default: string }>)[0];
        assert.deepEqual(accountTypeColumn && {
            type: accountTypeColumn.Type,
            nullable: accountTypeColumn.Null,
            defaultValue: accountTypeColumn.Default
        }, {
            type: "enum('community','staff')",
            nullable: 'NO',
            defaultValue: 'community'
        });
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

        await assert.rejects(
            () => pool.query(`INSERT INTO CommunityProfiles (UserId, AccountType, Status) VALUES (1, 'community', 'active')`)
        );
        assert.equal(await users.findCommunityProfileByUserId(1), null);

        const [legacyInsert] = await pool.query(
            `INSERT INTO Users (Mail, Username, Password, RoleId, AccountType, Status)
             VALUES ('rolling-community@test.local', 'rolling-community', 'hash', 2, 'community', 'inactive')`
        );
        const rollingCommunityId = Number((legacyInsert as { insertId: number }).insertId);
        assert.equal((await users.findCommunityProfileByUserId(rollingCommunityId))?.status, 'inactive');
        await pool.query(
            `UPDATE Users
             SET Status = 'banned', BannedByUserId = 1, BannedReason = 'Rolling deployment moderation', BannedAt = CURRENT_TIMESTAMP
             WHERE Id = ?`,
            [rollingCommunityId]
        );
        assert.equal((await users.findCommunityProfileByUserId(rollingCommunityId))?.status, 'banned');
        assert.equal(await users.getRoleIdByName('user'), 2);
        const staff = await users.create({
            mail: 'staff@test.local',
            username: 'staff',
            passwordHash: 'password-hash',
            roleId: 2,
            accountType: 'staff',
            status: 'active'
        });
        assert.equal(staff.accountType, 'staff');
        assert.equal(await users.findCommunityProfileByUserId(staff.id), null);
        assert.equal((await users.findStaffProfileByUserId(staff.id))?.status, 'active');
        const author = await users.create({
            mail: 'author@test.local',
            username: 'author',
            passwordHash: 'password-hash',
            roleId: 2,
            accountType: 'community',
            status: 'active'
        });
        assert.equal(author.accountType, 'community');
        assert.equal(await users.isEmailTaken('author@test.local'), true);
        assert.equal((await users.findAuthByEmail('author@test.local'))?.passwordHash, 'password-hash');
        assert.equal(await adminUsers.ban(author.id, 1, 'Repository integration ban.'), true);
        assert.equal((await users.findById(author.id))?.status, 'banned');
        assert.equal(await adminUsers.unban(author.id, 1, 'Repository integration unban.'), true);
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
                { ingredientId: 1, quantity: 200, unit: 'g', note: null, sortOrder: 1 },
                { ingredientId: 10, note: 'to taste', sortOrder: 2 }
            ],
            steps: [{ stepNumber: 1, description: 'Cook the pasta.' }],
            equipments: [{ equipmentId: 1 }]
        });
        assert.equal(recipe.ingredients[0]?.quantity, 200);
        assert.equal(recipe.ingredients[1]?.quantity, null);
        assert.deepEqual(recipe.tagIds, [1]);
        assert.deepEqual(recipe.equipments, [{ equipmentId: 1 }]);

        const submitted = await recipes.submit(recipe.id, 'quick-pasta');
        assert.equal(submitted.status, 'pending');
        assert.equal(await adminRecipes.publish(recipe.id, 1), true);

        const published = await recipes.searchPublished(author.id, { q: 'pasta' }, { page: 1, limit: 12, offset: 0 });
        assert.equal(published.items[0]?.slug, 'quick-pasta');
        const detail = await recipes.findPublishedBySlug(author.id, 'quick-pasta');
        assert.equal(detail?.ingredients[0]?.name, 'Pasta');
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

        assert.equal(await adminComments.hide(rootComment.id, 1), true);
        assert.equal((await adminComments.findModeratedForAdmin()).length, 1);
        assert.equal(await adminComments.unmoderate(rootComment.id), true);

        assert.equal(await comments.softDelete(reply.id, author.id), true);
        assert.equal(await adminComments.restore(reply.id), true);
        assert.equal(await favorites.delete(2, recipe.id), true);

        await assert.rejects(() => recipes.create({
            userId: author.id,
            title: 'Rollback recipe',
            slug: 'rollback-recipe',
            ingredients: [{ ingredientId: 999_999, quantity: 1 }]
        }));
        assert.equal(await recipes.existsBySlug('rollback-recipe'), false);
    });

    it('searches published recipes with inclusive and exclusive tag and ingredient filters', async () => {
        const recipes = new RecipeRepositoryMysql(pool);
        const pagination = { page: 1, limit: 50, offset: 0 };
        const fixtureQuery = { q: 'filterfixture' };
        const ids = (result: Awaited<ReturnType<RecipeRepositoryMysql['searchPublished']>>) => result.items.map((item) => item.id);

        const inclusions = await recipes.searchPublished(null, {
            ...fixtureQuery,
            tagIds: [10, 11],
            ingredientIds: [10, 11]
        }, pagination);
        assert.deepEqual(ids(inclusions), [100, 101, 102, 104]);
        assert.equal(inclusions.pagination.totalItems, 4);
        assert.ok(!ids(inclusions).includes(105), 'draft recipes must not be returned');

        const excludedByTag = await recipes.searchPublished(null, {
            ...fixtureQuery,
            excludedTagIds: [12]
        }, pagination);
        assert.deepEqual(ids(excludedByTag), [100, 102, 103, 104, 106]);

        const excludedByIngredient = await recipes.searchPublished(null, {
            ...fixtureQuery,
            excludedIngredientIds: [12]
        }, pagination);
        assert.deepEqual(ids(excludedByIngredient), [100, 102, 103, 104, 106]);

        const includedAndExcluded = await recipes.searchPublished(null, {
            ...fixtureQuery,
            tagIds: [10, 11],
            excludedTagIds: [12],
            ingredientIds: [10, 11],
            excludedIngredientIds: [12]
        }, pagination);
        assert.deepEqual(ids(includedAndExcluded), [100, 102, 104]);

        const severalExclusions = await recipes.searchPublished(null, {
            ...fixtureQuery,
            excludedTagIds: [12, 999_999]
        }, pagination);
        assert.deepEqual(ids(severalExclusions), [100, 102, 103, 104, 106]);

        const unknownExclusion = await recipes.searchPublished(null, {
            ...fixtureQuery,
            excludedTagIds: [999_999],
            excludedIngredientIds: [999_999]
        }, pagination);
        assert.deepEqual(ids(unknownExclusion), [100, 101, 102, 103, 104, 106]);

        const unknownInclusion = await recipes.searchPublished(null, {
            ...fixtureQuery,
            tagIds: [999_999]
        }, pagination);
        assert.deepEqual(ids(unknownInclusion), []);
        assert.equal(unknownInclusion.pagination.totalItems, 0);

        const combinedFilters = await recipes.searchPublished(null, {
            ...fixtureQuery,
            categoryId: 2,
            excludedTagIds: [12],
            maxTotalTimeMinutes: 25
        }, pagination);
        assert.deepEqual(ids(combinedFilters), [100]);

        const exactPage = await recipes.searchPublished(null, {
            ...fixtureQuery,
            tagIds: [10],
            excludedTagIds: [12]
        }, { page: 1, limit: 2, offset: 0 });
        assert.deepEqual(ids(exactPage), [100, 102]);
        assert.deepEqual(exactPage.pagination, {
            page: 1,
            limit: 2,
            totalItems: 5,
            totalPages: 3,
            hasNextPage: true,
            hasPreviousPage: false
        });

        const duplicateIngredientRows = await recipes.searchPublished(null, {
            ...fixtureQuery,
            ingredientIds: [10]
        }, pagination);
        assert.equal(duplicateIngredientRows.items.length, 6);
        assert.equal(new Set(ids(duplicateIngredientRows)).size, duplicateIngredientRows.items.length);
        assert.equal(duplicateIngredientRows.pagination.totalItems, 6);
    });

    it('rolls the profile migration back without losing linked community content', async () => {
        await pool.query(`UPDATE StaffProfiles SET Status = 'disabled' WHERE UserId = 3`);

        const rollbackPath = new URL('../../../database/deploy/b1_2_community_staff_profiles.rollback.sql', import.meta.url);
        const rollback = (await readFile(rollbackPath, 'utf8'))
            .replace(/USE\s+recipe_shelter\s*;/i, `USE \`${requireSafeTestDatabaseName()}\`;`);
        await adminConnection.query(rollback);

        const [profileTables] = await pool.query(
            `SELECT TABLE_NAME AS TableName
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('CommunityProfiles', 'StaffProfiles')`,
            [requireSafeTestDatabaseName()]
        );
        assert.deepEqual(profileTables, []);

        const [legacyStatuses] = await pool.query(
            `SELECT Id, Status
             FROM Users
             WHERE Id IN (2, 3, 4)
             ORDER BY Id`
        );
        assert.deepEqual(legacyStatuses, [
            { Id: 2, Status: 'active' },
            { Id: 3, Status: 'banned' },
            { Id: 4, Status: 'banned' }
        ]);

        const [contentCounts] = await pool.query(
            `SELECT
                (SELECT COUNT(*) FROM Recipes) AS RecipesCount,
                (SELECT COUNT(*) FROM Comments) AS CommentsCount,
                (SELECT COUNT(*) FROM Favorites) AS FavoritesCount`
        );
        assert.deepEqual(contentCounts, [{ RecipesCount: 8, CommentsCount: 2, FavoritesCount: 0 }]);
    });
});
