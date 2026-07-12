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
            INSERT INTO Roles (Id, Name) VALUES (1, 'admin'), (2, 'user');
            INSERT INTO Users (Id, Mail, Username, Password, RoleId, Status, EmailValidatedAt) VALUES
                (1, 'admin@test.local', 'admin', 'hash', 1, 'active', CURRENT_TIMESTAMP),
                (2, 'reader@test.local', 'reader', 'hash', 2, 'active', CURRENT_TIMESTAMP);
            INSERT INTO RecipeCategories (Id, Name, Slug, IconName) VALUES (1, 'Main', 'main', 'dish');
            INSERT INTO Ingredients (Id, Name, Slug) VALUES (1, 'Pasta', 'pasta');
            INSERT INTO Equipments (Id, Name, Slug) VALUES (1, 'Pot', 'pot');
            INSERT INTO TagGroups (Id, Name, Slug, SortOrder) VALUES (1, 'Time', 'time', 1);
            INSERT INTO Tags (Id, GroupId, Name, Slug) VALUES (1, 1, 'Quick', 'quick');
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

        assert.equal(await users.getRoleIdByName('user'), 2);
        const author = await users.create({
            mail: 'author@test.local',
            username: 'author',
            passwordHash: 'password-hash',
            roleId: 2,
            status: 'active'
        });
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
            ingredients: [{ ingredientId: 1, quantity: 200, unit: 'g', note: null, sortOrder: 1 }],
            steps: [{ stepNumber: 1, description: 'Cook the pasta.' }],
            equipments: [{ equipmentId: 1 }]
        });
        assert.equal(recipe.ingredients[0]?.quantity, 200);
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
});
