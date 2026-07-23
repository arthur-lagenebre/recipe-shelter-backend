import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import mysql from 'mysql2/promise';

import { executeMysqlScript } from './mysql-script.js';

import { AdminAuditRepositoryMysql } from '../../../src/repositories/admin/admin.audit.repository.mysql.js';
import { AdminIngredientRepositoryMysql } from '../../../src/repositories/admin/admin.ingredients.repository.mysql.js';
import { AdminRecipeRepositoryMysql } from '../../../src/repositories/admin/admin.recipe.repository.mysql.js';
import { IngredientRepositoryMysql } from '../../../src/repositories/ingredients/ingredient.repository.mysql.js';
import { RecipeRepositoryMysql } from '../../../src/repositories/recipes/recipe.repository.mysql.js';
import { AdminAuditActionRunnerMysql } from '../../../src/services/admin/admin.audit-action.runner.js';
import { AdminAuditService } from '../../../src/services/admin/admin.audit.service.js';
import { AdminIngredientService } from '../../../src/services/admin/admin.ingredients.service.js';
import { env } from '../../../src/utils/env.js';

const baseTestDatabaseName = process.env.TEST_DB_NAME?.trim() ?? '';
const mysqlEnabled = Boolean(baseTestDatabaseName);

function requireIngredientCatalogTestDatabaseName(): string {
    if (!/^[a-zA-Z0-9_]+$/.test(baseTestDatabaseName))
        throw new Error('TEST_DB_NAME must contain only letters, numbers and underscores');
    if (!baseTestDatabaseName.toLowerCase().includes('test'))
        throw new Error('TEST_DB_NAME must contain "test"');
    if (baseTestDatabaseName === env.db.name)
        throw new Error('TEST_DB_NAME must be different from DB_NAME');

    const databaseName = `${baseTestDatabaseName}_ingredient_catalog`;
    if (databaseName.length > 64)
        throw new Error('TEST_DB_NAME is too long for the ingredient catalog integration database suffix');
    return databaseName;
}

function targetDatabase(sql: string, databaseName: string): string {
    return sql.replace(/USE\s+recipe_shelter\s*;/i, `USE \`${databaseName}\`;`);
}

function assertActiveNormalizedDuplicateRejected(error: unknown): boolean {
    assert.ok(error instanceof Error);

    const mysqlError = error as Error & {
        errno?: number;
        sqlMessage?: string;
    };

    assert.equal(mysqlError.errno, 1062);
    assert.match(mysqlError.sqlMessage ?? '', /ingredients_active_normalized_name_UK/);
    return true;
}

function assertAliasNormalizedDuplicateRejected(error: unknown): boolean {
    assert.ok(error instanceof Error);

    const mysqlError = error as Error & {
        errno?: number;
        sqlMessage?: string;
    };

    assert.equal(mysqlError.errno, 1062);
    assert.match(mysqlError.sqlMessage ?? '', /ingredient_aliases_language_normalized_name_UK/);
    return true;
}

function assertAliasTargetRejected(error: unknown): boolean {
    assert.ok(error instanceof Error);

    const mysqlError = error as Error & {
        errno?: number;
        sqlMessage?: string;
        sqlState?: string;
    };

    assert.equal(mysqlError.errno, 1644);
    assert.equal(mysqlError.sqlState, '45000');
    assert.equal(mysqlError.sqlMessage, 'Ingredient aliases can only reference active canonical ingredients');
    return true;
}

function assertMergeSourceNameAliasProtected(error: unknown): boolean {
    assert.ok(error instanceof Error);
    assert.equal((error as Error & { code?: string }).code, 'ADMIN_INGREDIENT_ALIASES_MERGE_SOURCE_NAME_PROTECTED');
    return true;
}

function assertMergeSourceNameAliasConflict(error: unknown): boolean {
    assert.ok(error instanceof Error);
    assert.equal((error as Error & { code?: string }).code, 'ADMIN_INGREDIENTS_MERGE_SOURCE_NAME_ALIAS_CONFLICT');
    return true;
}

function assertRecipeIngredientTargetRejected(error: unknown): boolean {
    assert.ok(error instanceof Error);

    const mysqlError = error as Error & {
        errno?: number;
        sqlMessage?: string;
        sqlState?: string;
    };

    assert.equal(mysqlError.errno, 1644);
    assert.equal(mysqlError.sqlState, '45000');
    assert.equal(mysqlError.sqlMessage, 'Recipes can only reference active canonical ingredients');
    return true;
}

function assertIngredientDeletionRejected(error: unknown): boolean {
    assert.ok(error instanceof Error);

    const mysqlError = error as Error & {
        errno?: number;
        sqlMessage?: string;
        sqlState?: string;
    };

    assert.equal(mysqlError.errno, 1644);
    assert.equal(mysqlError.sqlState, '45000');
    assert.equal(mysqlError.sqlMessage, 'Ingredients cannot be physically deleted; deprecate or merge them instead');
    return true;
}

describe('ingredient catalog schema integration', { skip: !mysqlEnabled && 'Set TEST_DB_NAME to run isolated MySQL tests' }, () => {
    let connection: mysql.Connection;
    let pool: mysql.Pool;
    let seed: string;

    before(async () => {
        const databaseName = requireIngredientCatalogTestDatabaseName();
        connection = await mysql.createConnection({
            host: env.db.host,
            port: env.db.port,
            user: env.db.user,
            password: env.db.password,
            multipleStatements: true
        });

        await connection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
        await connection.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

        const schemaPath = new URL('../../../database/migrations/1_create_schema.sql', import.meta.url);
        const seedPath = new URL('../../../database/seed.sql', import.meta.url);
        const schema = targetDatabase(await readFile(schemaPath, 'utf8'), databaseName);
        seed = targetDatabase(await readFile(seedPath, 'utf8'), databaseName);

        await executeMysqlScript(connection, schema);
        await connection.query(seed);
        pool = mysql.createPool({
            host: env.db.host,
            port: env.db.port,
            user: env.db.user,
            password: env.db.password,
            database: databaseName,
            connectionLimit: 2,
            timezone: 'Z'
        });
    });

    after(async () => {
        if (pool)
            await pool.end();
        if (connection) {
            await connection.query(`DROP DATABASE IF EXISTS \`${requireIngredientCatalogTestDatabaseName()}\``);
            await connection.end();
        }
    });

    it('builds the final ingredient model from an empty database and the central seed', async () => {
        const databaseName = requireIngredientCatalogTestDatabaseName();
        const [columns] = await connection.query(`SELECT COLUMN_NAME AS ColumnName, COLUMN_TYPE AS ColumnType, IS_NULLABLE AS IsNullable, COLUMN_DEFAULT AS ColumnDefault FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Ingredients' ORDER BY ORDINAL_POSITION`, [databaseName]);

        assert.deepEqual(columns, [
            { ColumnName: 'Id', ColumnType: 'bigint unsigned', IsNullable: 'NO', ColumnDefault: null },
            { ColumnName: 'Name', ColumnType: 'varchar(255)', IsNullable: 'NO', ColumnDefault: null },
            { ColumnName: 'NormalizedName', ColumnType: 'varchar(255)', IsNullable: 'NO', ColumnDefault: null },
            { ColumnName: 'Slug', ColumnType: 'varchar(255)', IsNullable: 'NO', ColumnDefault: null },
            { ColumnName: 'Status', ColumnType: "enum('active','deprecated','merged')", IsNullable: 'NO', ColumnDefault: 'active' },
            { ColumnName: 'MergedIntoIngredientId', ColumnType: 'bigint unsigned', IsNullable: 'YES', ColumnDefault: null },
            { ColumnName: 'CreatedAt', ColumnType: 'datetime', IsNullable: 'NO', ColumnDefault: 'CURRENT_TIMESTAMP' },
            { ColumnName: 'UpdatedAt', ColumnType: 'datetime', IsNullable: 'NO', ColumnDefault: 'CURRENT_TIMESTAMP' }
        ]);

        const [indexes] = await connection.query(`SELECT DISTINCT INDEX_NAME AS IndexName FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Ingredients' ORDER BY INDEX_NAME`, [databaseName]);
        assert.deepEqual(
            (indexes as Array<{ IndexName: string }>).map(({ IndexName }) => IndexName),
            [
                'idx_ingredients_merged_into_ingredient_id',
                'idx_ingredients_status_name',
                'ingredients_active_normalized_name_UK',
                'ingredients_slug_UK',
                'PRIMARY'
            ]
        );

        const [beforeSecondSeed] = await connection.query(`SELECT COUNT(*) AS IngredientCount FROM Ingredients`);
        await connection.query(seed);
        const [afterSecondSeed] = await connection.query(`SELECT COUNT(*) AS IngredientCount FROM Ingredients`);
        assert.deepEqual(afterSecondSeed, beforeSecondSeed);

        const ingredients = await new IngredientRepositoryMysql(pool).findAll();
        const freshCream = ingredients.find(({ slug }) => slug === 'creme-fraiche');
        assert.ok(freshCream);
        assert.deepEqual(
            {
                name: freshCream.name,
                normalizedName: freshCream.normalizedName,
                status: freshCream.status,
                mergedIntoIngredientId: freshCream.mergedIntoIngredientId
            },
            {
                name: 'Crème fraîche',
                normalizedName: 'creme fraiche',
                status: 'active',
                mergedIntoIngredientId: null
            }
        );
        assert.ok(freshCream.createdAt instanceof Date);
        assert.ok(freshCream.updatedAt instanceof Date);
    });

    it('defines localized ingredient aliases in the final schema', async () => {
        const databaseName = requireIngredientCatalogTestDatabaseName();
        const [columns] = await connection.query(`SELECT COLUMN_NAME AS ColumnName, COLUMN_TYPE AS ColumnType, IS_NULLABLE AS IsNullable, COLUMN_DEFAULT AS ColumnDefault FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'IngredientAliases' ORDER BY ORDINAL_POSITION`, [databaseName]);

        assert.deepEqual(columns, [
            { ColumnName: 'Id', ColumnType: 'bigint unsigned', IsNullable: 'NO', ColumnDefault: null },
            { ColumnName: 'IngredientId', ColumnType: 'bigint unsigned', IsNullable: 'NO', ColumnDefault: null },
            { ColumnName: 'Name', ColumnType: 'varchar(255)', IsNullable: 'NO', ColumnDefault: null },
            { ColumnName: 'NormalizedName', ColumnType: 'varchar(255)', IsNullable: 'NO', ColumnDefault: null },
            { ColumnName: 'LanguageCode', ColumnType: 'varchar(35)', IsNullable: 'NO', ColumnDefault: null },
            { ColumnName: 'CreatedAt', ColumnType: 'datetime', IsNullable: 'NO', ColumnDefault: 'CURRENT_TIMESTAMP' },
            { ColumnName: 'UpdatedAt', ColumnType: 'datetime', IsNullable: 'NO', ColumnDefault: 'CURRENT_TIMESTAMP' }
        ]);

        const [indexes] = await connection.query(`SELECT DISTINCT INDEX_NAME AS IndexName FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'IngredientAliases' ORDER BY INDEX_NAME`, [databaseName]);
        assert.deepEqual(
            (indexes as Array<{ IndexName: string }>).map(({ IndexName }) => IndexName),
            ['idx_ingredient_aliases_ingredient_language', 'ingredient_aliases_language_normalized_name_UK', 'PRIMARY']
        );

        const [foreignKeys] = await connection.query(`SELECT COLUMN_NAME AS ColumnName, LOWER(REFERENCED_TABLE_NAME) AS ReferencedTableName, REFERENCED_COLUMN_NAME AS ReferencedColumnName FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'IngredientAliases' AND REFERENCED_TABLE_NAME IS NOT NULL`, [databaseName]);
        assert.deepEqual(foreignKeys, [
            {
                ColumnName: 'IngredientId',
                ReferencedTableName: 'ingredients',
                ReferencedColumnName: 'Id'
            }
        ]);

        const [protectionTriggers] = await connection.query(`SELECT TRIGGER_NAME AS TriggerName, ACTION_TIMING AS ActionTiming, EVENT_MANIPULATION AS EventManipulation FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ? AND TRIGGER_NAME = 'ingredient_aliases_merged_name_BD'`, [databaseName]);
        assert.deepEqual(protectionTriggers, [
            {
                TriggerName: 'ingredient_aliases_merged_name_BD',
                ActionTiming: 'BEFORE',
                EventManipulation: 'DELETE'
            }
        ]);
    });

    it('stores free-text ingredients while recipe search uses canonical ingredient ids when available', async () => {
        const databaseName = requireIngredientCatalogTestDatabaseName();
        const [columns] = await connection.query(`SELECT COLUMN_NAME AS ColumnName, COLUMN_TYPE AS ColumnType, IS_NULLABLE AS IsNullable, COLUMN_DEFAULT AS ColumnDefault FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'RecipeIngredients' ORDER BY ORDINAL_POSITION`, [databaseName]);
        assert.deepEqual(columns, [
            { ColumnName: 'Id', ColumnType: 'bigint unsigned', IsNullable: 'NO', ColumnDefault: null },
            { ColumnName: 'RecipeId', ColumnType: 'bigint unsigned', IsNullable: 'NO', ColumnDefault: null },
            { ColumnName: 'IngredientId', ColumnType: 'bigint unsigned', IsNullable: 'YES', ColumnDefault: null },
            { ColumnName: 'DisplayText', ColumnType: 'varchar(255)', IsNullable: 'NO', ColumnDefault: null },
            { ColumnName: 'Quantity', ColumnType: 'decimal(10,3)', IsNullable: 'YES', ColumnDefault: null },
            { ColumnName: 'Unit', ColumnType: 'varchar(64)', IsNullable: 'YES', ColumnDefault: null },
            { ColumnName: 'Note', ColumnType: 'varchar(255)', IsNullable: 'YES', ColumnDefault: null },
            { ColumnName: 'SortOrder', ColumnType: 'int', IsNullable: 'NO', ColumnDefault: '1' }
        ]);

        const [integrityTriggers] = await connection.query(`SELECT TRIGGER_NAME AS TriggerName, LOWER(EVENT_OBJECT_TABLE) AS TableName, ACTION_TIMING AS ActionTiming, EVENT_MANIPULATION AS EventManipulation FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ? AND TRIGGER_NAME IN ('ingredients_merged_recipe_associations_BU', 'recipe_ingredients_active_ingredient_BI', 'recipe_ingredients_active_ingredient_BU') ORDER BY TRIGGER_NAME`, [databaseName]);
        assert.deepEqual(integrityTriggers, [
            {
                TriggerName: 'ingredients_merged_recipe_associations_BU',
                TableName: 'ingredients',
                ActionTiming: 'BEFORE',
                EventManipulation: 'UPDATE'
            },
            {
                TriggerName: 'recipe_ingredients_active_ingredient_BI',
                TableName: 'recipeingredients',
                ActionTiming: 'BEFORE',
                EventManipulation: 'INSERT'
            },
            {
                TriggerName: 'recipe_ingredients_active_ingredient_BU',
                TableName: 'recipeingredients',
                ActionTiming: 'BEFORE',
                EventManipulation: 'UPDATE'
            }
        ]);

        await connection.query(`INSERT INTO Users (Id, Mail, Username, Password, AccountType, Status, EmailValidatedAt) VALUES (970, 'recipe-ingredient-author@example.test', 'recipe-ingredient-author', 'test-password-hash', 'community', 'active', CURRENT_TIMESTAMP); INSERT INTO Recipes (Id, UserId, CategoryId, Title, Slug, Description, PrepTimeMinutes, Servings, Status, PublishedAt) VALUES (970, 970, 1, 'Recipe ingredient fixture', 'recipe-ingredient-fixture', 'Fixture', 5, 2, 'published', CURRENT_TIMESTAMP); INSERT INTO Ingredients (Id, Name, NormalizedName, Slug, Status) VALUES (970, 'Canonical tomato fixture', 'canonical tomato fixture', 'canonical-tomato-fixture', 'active'), (971, 'Deprecated recipe fixture', 'deprecated recipe fixture', 'deprecated-recipe-fixture', 'deprecated'), (972, 'Canonical merge target fixture', 'canonical merge target fixture', 'canonical-merge-target-fixture', 'active'), (974, 'Canonical salt fixture', 'canonical salt fixture', 'canonical-salt-fixture', 'active'); INSERT INTO Ingredients (Id, Name, NormalizedName, Slug, Status, MergedIntoIngredientId) VALUES (973, 'Merged recipe fixture', 'merged recipe fixture', 'merged-recipe-fixture', 'merged', 972); INSERT INTO RecipeIngredients (Id, RecipeId, IngredientId, DisplayText, Quantity, Unit, Note, SortOrder) VALUES (970, 970, 970, '2 grosses tomates bien mûres', 2, 'pièces', 'mondées', 2), (971, 970, 974, 'une pincée de fleur de sel', NULL, NULL, 'à ajuster', 1), (972, 970, NULL, 'Poudre de lune brute', 1, 'pincée', NULL, 3)`);

        const recipes = new RecipeRepositoryMysql(pool);
        const editableRecipe = await recipes.findById(970);
        assert.deepEqual(
            editableRecipe?.ingredients.map(({ ingredientId, displayText, quantity, unit, note, sortOrder }) => ({
                ingredientId,
                displayText,
                quantity,
                unit,
                note,
                sortOrder
            })),
            [
                {
                    ingredientId: 974,
                    displayText: 'une pincée de fleur de sel',
                    quantity: null,
                    unit: null,
                    note: 'à ajuster',
                    sortOrder: 1
                },
                {
                    ingredientId: 970,
                    displayText: '2 grosses tomates bien mûres',
                    quantity: 2,
                    unit: 'pièces',
                    note: 'mondées',
                    sortOrder: 2
                },
                {
                    ingredientId: null,
                    displayText: 'Poudre de lune brute',
                    quantity: 1,
                    unit: 'pincée',
                    note: null,
                    sortOrder: 3
                }
            ]
        );

        const searchResult = await recipes.searchPublished(null, { ingredientIds: [970] }, { page: 1, limit: 12, offset: 0 });
        assert.deepEqual(
            searchResult.items.map(({ id }) => id),
            [970]
        );
        const publicRecipe = await recipes.findPublishedBySlug(null, 'recipe-ingredient-fixture');
        assert.equal(publicRecipe?.ingredients[1]?.name, 'Canonical tomato fixture');
        assert.equal(publicRecipe?.ingredients[1]?.displayText, '2 grosses tomates bien mûres');
        assert.deepEqual(publicRecipe?.ingredients[2], {
            id: null,
            name: null,
            slug: null,
            displayText: 'Poudre de lune brute',
            quantity: 1,
            unit: 'pincée',
            note: null,
            sortOrder: 3
        });
        assert.deepEqual((await new AdminRecipeRepositoryMysql(pool).findByIdForAdmin(970))?.ingredients[2], {
            id: null,
            name: null,
            displayText: 'Poudre de lune brute',
            quantity: 1,
            unit: 'pincée',
            note: null,
            sortOrder: 3
        });

        await assert.rejects(() => connection.query(`INSERT INTO RecipeIngredients (RecipeId, IngredientId, DisplayText) VALUES (970, 971, 'ancien ingrédient')`), assertRecipeIngredientTargetRejected);
        await assert.rejects(() => connection.query(`INSERT INTO RecipeIngredients (RecipeId, IngredientId, DisplayText) VALUES (970, 973, 'ingrédient déjà fusionné')`), assertRecipeIngredientTargetRejected);
        await assert.rejects(() => connection.query(`UPDATE RecipeIngredients SET IngredientId = 971 WHERE Id = 971`), assertRecipeIngredientTargetRejected);
        await assert.rejects(() => connection.query(`INSERT INTO RecipeIngredients (RecipeId, IngredientId, DisplayText) VALUES (970, 970, '   ')`));
        await assert.rejects(() => connection.query(`UPDATE Ingredients SET Status = 'merged', MergedIntoIngredientId = 972 WHERE Id = 970`), /An ingredient must have no recipe associations before being merged/);
    });

    it('resolves free text against the active catalogue or creates one proposal without blocking submission', async () => {
        await connection.query(`INSERT INTO Users (Id, Mail, Username, Password, AccountType, Status, EmailValidatedAt) VALUES (975, 'free-ingredient-author@example.test', 'free-ingredient-author', 'test-password-hash', 'community', 'active', CURRENT_TIMESTAMP); INSERT INTO Ingredients (Id, Name, NormalizedName, Slug, Status) VALUES (975, 'Moon water fixture', 'moon water fixture', 'moon-water-fixture', 'active'), (976, 'Celestial powder fixture', 'celestial powder fixture', 'celestial-powder-fixture', 'active'); INSERT INTO IngredientAliases (Id, IngredientId, Name, NormalizedName, LanguageCode) VALUES (975, 976, 'Star dust fixture', 'star dust fixture', 'en')`);

        const recipes = new RecipeRepositoryMysql(pool);
        const recipe = await recipes.create({
            userId: 975,
            title: 'Free ingredient recipe',
            slug: 'draft-free-ingredient-recipe',
            ingredients: [
                { ingredientId: null, displayText: 'Moon water fixture', normalizedName: 'moon water fixture', sortOrder: 1 },
                { ingredientId: null, displayText: 'Star dust fixture', normalizedName: 'star dust fixture', sortOrder: 2 },
                { ingredientId: null, displayText: 'Nebula flakes fixture', normalizedName: 'nebula flakes fixture', sortOrder: 3 }
            ]
        });

        assert.deepEqual(
            recipe.ingredients.map(({ ingredientId, displayText }) => ({ ingredientId, displayText })),
            [
                { ingredientId: 975, displayText: 'Moon water fixture' },
                { ingredientId: 976, displayText: 'Star dust fixture' },
                { ingredientId: null, displayText: 'Nebula flakes fixture' }
            ]
        );

        const [initialProposals] = await connection.query(`SELECT ProposalType, ProposedName, NormalizedName, Status FROM CatalogProposals WHERE RecipeId = ?`, [recipe.id]);
        assert.deepEqual(initialProposals, [
            {
                ProposalType: 'ingredient',
                ProposedName: 'Nebula flakes fixture',
                NormalizedName: 'nebula flakes fixture',
                Status: 'pending'
            }
        ]);
        assert.equal(
            (await new IngredientRepositoryMysql(pool).findAll()).some(({ normalizedName }) => normalizedName === 'nebula flakes fixture'),
            false
        );

        const updated = await recipes.updateDraft({
            id: recipe.id,
            userId: 975,
            title: recipe.title,
            slug: recipe.slug,
            ingredients: [
                {
                    ingredientId: null,
                    displayText: 'NEBULA---FLAKES FIXTURE',
                    normalizedName: 'nebula flakes fixture'
                }
            ]
        });
        assert.equal(updated.ingredients[0]?.ingredientId, null);
        assert.equal(updated.ingredients[0]?.displayText, 'NEBULA---FLAKES FIXTURE');

        const [proposalCounts] = await connection.query(`SELECT COUNT(*) AS ProposalCount FROM CatalogProposals WHERE RecipeId = ? AND ProposalType = 'ingredient' AND NormalizedName = ?`, [recipe.id, 'nebula flakes fixture']);
        assert.equal(Number((proposalCounts as Array<{ ProposalCount: number | string }>)[0]?.ProposalCount), 1);

        const submitted = await recipes.submit(recipe.id, 'free-ingredient-recipe');
        assert.equal(submitted.status, 'pending');
        assert.deepEqual(submitted.ingredients[0], {
            ingredientId: null,
            displayText: 'NEBULA---FLAKES FIXTURE',
            quantity: null,
            unit: null,
            note: null,
            sortOrder: 1
        });
    });

    it('merges canonical ingredients transactionally while preserving author display text and moving aliases', async () => {
        await connection.query(`INSERT INTO Users (Id, Mail, Username, Password, AccountType, Status, EmailValidatedAt) VALUES (980, 'ingredient-merge-author@example.test', 'ingredient-merge-author', 'test-password-hash', 'community', 'active', CURRENT_TIMESTAMP); INSERT INTO Recipes (Id, UserId, CategoryId, Title, Slug, Description, PrepTimeMinutes, Servings, Status, PublishedAt) VALUES (980, 980, 1, 'Ingredient merge recipe', 'ingredient-merge-recipe', 'Fixture', 5, 2, 'published', CURRENT_TIMESTAMP); INSERT INTO Ingredients (Id, Name, NormalizedName, Slug) VALUES (980, 'Ingredient merge source', 'ingredient merge source', 'ingredient-merge-source'), (981, 'Ingredient merge target', 'ingredient merge target', 'ingredient-merge-target'); INSERT INTO Ingredients (Id, Name, NormalizedName, Slug, Status, MergedIntoIngredientId) VALUES (982, 'Ingredient historical redirect', 'ingredient historical redirect', 'ingredient-historical-redirect', 'merged', 980); INSERT INTO IngredientAliases (Id, IngredientId, Name, NormalizedName, LanguageCode) VALUES (980, 980, 'Alias de fusion', 'alias de fusion', 'fr'); INSERT INTO RecipeIngredients (Id, RecipeId, IngredientId, DisplayText, Quantity, Unit, Note, SortOrder) VALUES (980, 980, 980, 'deux belles poignées selon l’auteur', 2, 'poignées', 'texte conservé', 1)`);

        const db = await pool.getConnection();
        const repository = new AdminIngredientRepositoryMysql(pool);
        try {
            await db.beginTransaction();
            await repository.findByIdsForUpdate([980, 981], db);
            const result = await repository.merge(
                {
                    sourceIngredientId: 980,
                    targetIngredientId: 981,
                    sourceName: 'Ingredient merge source',
                    sourceNormalizedName: 'ingredient merge source',
                    sourceNameLanguageCode: 'fr'
                },
                db
            );
            await db.commit();

            assert.deepEqual(result, {
                status: 'merged',
                sourceRecipeAssociationCountBefore: 1,
                targetRecipeAssociationCountBefore: 0,
                targetRecipeAssociationCountAfter: 1,
                transferredRecipeAssociationCount: 1,
                sourceAliasCountBefore: 1,
                targetAliasCountBefore: 0,
                targetAliasCountAfter: 2,
                transferredAliasCount: 1,
                sourceNameAliasResolution: 'created',
                redirectedMergedIngredientCount: 1
            });
        } catch (error) {
            await db.rollback();
            throw error;
        } finally {
            db.release();
        }

        const [recipeIngredients] = await connection.query(`SELECT IngredientId, DisplayText, Quantity, Unit, Note FROM RecipeIngredients WHERE Id = 980`);
        assert.deepEqual(recipeIngredients, [
            {
                IngredientId: 981,
                DisplayText: 'deux belles poignées selon l’auteur',
                Quantity: '2.000',
                Unit: 'poignées',
                Note: 'texte conservé'
            }
        ]);

        const [aliases] = await connection.query(`SELECT IngredientId, Name, LanguageCode FROM IngredientAliases WHERE IngredientId = 981 ORDER BY Name`);
        assert.deepEqual(aliases, [
            { IngredientId: 981, Name: 'Alias de fusion', LanguageCode: 'fr' },
            { IngredientId: 981, Name: 'Ingredient merge source', LanguageCode: 'fr' }
        ]);

        const [ingredients] = await connection.query(`SELECT Id, Status, MergedIntoIngredientId FROM Ingredients WHERE Id IN (980, 982) ORDER BY Id`);
        assert.deepEqual(ingredients, [
            { Id: 980, Status: 'merged', MergedIntoIngredientId: 981 },
            { Id: 982, Status: 'merged', MergedIntoIngredientId: 981 }
        ]);

        await assert.rejects(() => connection.query(`DELETE FROM IngredientAliases WHERE IngredientId = 981 AND LanguageCode = 'fr' AND NormalizedName = 'ingredient merge source'`), /A merged ingredient source-name alias cannot be deleted/);
    });

    it('commits the ingredient merge and its complete audit atomically, then rolls both back on audit failure', async () => {
        await connection.query(`INSERT INTO Users (Id, Mail, Username, Password, AccountType, Status) VALUES (985, 'ingredient-merge-staff@example.test', 'ingredient-merge-staff', 'test-password-hash', 'staff', 'inactive'), (986, 'ingredient-merge-author-two@example.test', 'ingredient-merge-author-two', 'test-password-hash', 'community', 'active'); INSERT INTO Recipes (Id, UserId, CategoryId, Title, Slug, Description, PrepTimeMinutes, Servings) VALUES (985, 986, 1, 'Ingredient transactional merge one', 'ingredient-transactional-merge-one', 'Fixture', 5, 2), (986, 986, 1, 'Ingredient transactional merge two', 'ingredient-transactional-merge-two', 'Fixture', 5, 2); INSERT INTO Ingredients (Id, Name, NormalizedName, Slug) VALUES (985, 'Transactional ingredient source', 'transactional ingredient source', 'transactional-ingredient-source'), (986, 'Transactional ingredient target', 'transactional ingredient target', 'transactional-ingredient-target'), (988, 'Rollback ingredient source', 'rollback ingredient source', 'rollback-ingredient-source'), (989, 'Rollback ingredient target', 'rollback ingredient target', 'rollback-ingredient-target'); INSERT INTO Ingredients (Id, Name, NormalizedName, Slug, Status, MergedIntoIngredientId) VALUES (987, 'Transactional ingredient history', 'transactional ingredient history', 'transactional-ingredient-history', 'merged', 985); INSERT INTO IngredientAliases (Id, IngredientId, Name, NormalizedName, LanguageCode) VALUES (985, 985, 'Transactional source synonym', 'transactional source synonym', 'en'); INSERT INTO RecipeIngredients (Id, RecipeId, IngredientId, DisplayText, Quantity, Unit, Note, SortOrder) VALUES (985, 985, 985, 'deux mesures rédigées par l’auteur', 2, 'mesures', 'premier texte', 1), (986, 986, 985, 'une autre formulation source', 1, NULL, NULL, 1), (987, 986, 986, 'formulation déjà canonique', 3, 'unités', NULL, 2), (988, 985, 988, 'libellé qui doit rester sur la source', 4, 'parts', NULL, 2)`);

        const repository = new AdminIngredientRepositoryMysql(pool);
        const auditActions = new AdminAuditActionRunnerMysql(pool, (db) => new AdminAuditService(new AdminAuditRepositoryMysql(db)));
        const service = new AdminIngredientService(repository, auditActions);
        const correlationId = '00000000-0000-4000-8000-000000000985';

        const merged = await service.merge(
            985,
            {
                targetIngredientId: 986,
                reason: 'Doublon confirmé par le test transactionnel.'
            },
            985,
            { correlationId }
        );

        assert.equal(merged.status, 'merged');
        assert.equal(merged.mergedIntoIngredientId, 986);
        const [committedRecipeIngredients] = await connection.query(`SELECT Id, IngredientId, DisplayText, Quantity, Unit, Note FROM RecipeIngredients WHERE Id IN (985, 986, 987) ORDER BY Id`);
        assert.deepEqual(committedRecipeIngredients, [
            {
                Id: 985,
                IngredientId: 986,
                DisplayText: 'deux mesures rédigées par l’auteur',
                Quantity: '2.000',
                Unit: 'mesures',
                Note: 'premier texte'
            },
            {
                Id: 986,
                IngredientId: 986,
                DisplayText: 'une autre formulation source',
                Quantity: '1.000',
                Unit: null,
                Note: null
            },
            {
                Id: 987,
                IngredientId: 986,
                DisplayText: 'formulation déjà canonique',
                Quantity: '3.000',
                Unit: 'unités',
                Note: null
            }
        ]);

        const [committedAliases] = await connection.query(`SELECT IngredientId, Name, NormalizedName, LanguageCode FROM IngredientAliases WHERE IngredientId = 986 ORDER BY LanguageCode, Name`);
        assert.deepEqual(committedAliases, [
            {
                IngredientId: 986,
                Name: 'Transactional source synonym',
                NormalizedName: 'transactional source synonym',
                LanguageCode: 'en'
            },
            {
                IngredientId: 986,
                Name: 'Transactional ingredient source',
                NormalizedName: 'transactional ingredient source',
                LanguageCode: 'fr'
            }
        ]);

        const [committedIngredients] = await connection.query(`SELECT Id, Status, MergedIntoIngredientId FROM Ingredients WHERE Id IN (985, 986, 987) ORDER BY Id`);
        assert.deepEqual(committedIngredients, [
            { Id: 985, Status: 'merged', MergedIntoIngredientId: 986 },
            { Id: 986, Status: 'active', MergedIntoIngredientId: null },
            { Id: 987, Status: 'merged', MergedIntoIngredientId: 986 }
        ]);

        const [auditRows] = await connection.query(`SELECT Action, TargetType, TargetId, Reason, JSON_UNQUOTE(JSON_EXTRACT(BeforeValues, '$.source.status')) AS BeforeSourceStatus, CAST(JSON_UNQUOTE(JSON_EXTRACT(BeforeValues, '$.recipeAssociations.sourceCount')) AS UNSIGNED) AS BeforeSourceRecipeCount, CAST(JSON_UNQUOTE(JSON_EXTRACT(BeforeValues, '$.aliases.sourceCount')) AS UNSIGNED) AS BeforeSourceAliasCount, JSON_UNQUOTE(JSON_EXTRACT(AfterValues, '$.source.status')) AS AfterSourceStatus, CAST(JSON_UNQUOTE(JSON_EXTRACT(AfterValues, '$.recipeAssociations.targetCount')) AS UNSIGNED) AS AfterTargetRecipeCount, JSON_UNQUOTE(JSON_EXTRACT(AfterValues, '$.recipeAssociations.authorDisplayTextPreserved')) AS DisplayTextPreserved, CAST(JSON_UNQUOTE(JSON_EXTRACT(AfterValues, '$.aliases.targetCount')) AS UNSIGNED) AS AfterTargetAliasCount, JSON_UNQUOTE(JSON_EXTRACT(AfterValues, '$.aliases.sourceNameAlias.resolution')) AS SourceNameAliasResolution, CAST(JSON_UNQUOTE(JSON_EXTRACT(AfterValues, '$.redirectedMergedIngredientCount')) AS UNSIGNED) AS RedirectedMergedIngredientCount FROM AdminAuditLogs WHERE CorrelationId = ?`, [correlationId]);
        assert.deepEqual(auditRows, [
            {
                Action: 'ingredients.merge',
                TargetType: 'ingredient',
                TargetId: '985',
                Reason: 'Doublon confirmé par le test transactionnel.',
                BeforeSourceStatus: 'active',
                BeforeSourceRecipeCount: 2,
                BeforeSourceAliasCount: 1,
                AfterSourceStatus: 'merged',
                AfterTargetRecipeCount: 3,
                DisplayTextPreserved: 'true',
                AfterTargetAliasCount: 2,
                SourceNameAliasResolution: 'created',
                RedirectedMergedIngredientCount: 1
            }
        ]);

        const [sourceNameAliasRows] = await connection.query(`SELECT Id FROM IngredientAliases WHERE IngredientId = 986 AND NormalizedName = 'transactional ingredient source' AND LanguageCode = 'fr'`);
        const sourceNameAliasId = (sourceNameAliasRows as Array<{ Id: number }>)[0]?.Id;
        assert.ok(sourceNameAliasId);
        const protectedUpdateCorrelationId = '00000000-0000-4000-8000-000000000987';
        const protectedDeleteCorrelationId = '00000000-0000-4000-8000-000000000988';
        await assert.rejects(
            () =>
                service.updateAlias(
                    986,
                    sourceNameAliasId,
                    {
                        name: 'Source historique modifiée'
                    },
                    985,
                    { correlationId: protectedUpdateCorrelationId }
                ),
            assertMergeSourceNameAliasProtected
        );
        await assert.rejects(
            () => service.deleteAlias(986, sourceNameAliasId, 985, { correlationId: protectedDeleteCorrelationId }),
            assertMergeSourceNameAliasProtected
        );

        const updatedOrdinaryAlias = await service.updateAlias(
            986,
            985,
            {
                name: 'Updated transactional synonym'
            },
            985,
            { correlationId: '00000000-0000-4000-8000-000000000989' }
        );
        assert.equal(updatedOrdinaryAlias.name, 'Updated transactional synonym');
        const [protectedAliasState] = await connection.query(`SELECT Name, (SELECT COUNT(*) FROM AdminAuditLogs WHERE CorrelationId IN (?, ?)) AS RejectedAuditCount FROM IngredientAliases WHERE Id = ?`, [protectedUpdateCorrelationId, protectedDeleteCorrelationId, sourceNameAliasId]);
        assert.deepEqual(protectedAliasState, [
            {
                Name: 'Transactional ingredient source',
                RejectedAuditCount: 0
            }
        ]);

        const failedCorrelationId = '00000000-0000-4000-8000-000000000986';
        const failingService = new AdminIngredientService(
            repository,
            new AdminAuditActionRunnerMysql(pool, () => ({
                async record() {
                    throw new Error('forced ingredient merge audit failure');
                }
            }))
        );
        await assert.rejects(
            () =>
                failingService.merge(
                    988,
                    {
                        targetIngredientId: 989,
                        reason: 'Cette fusion doit être entièrement annulée.'
                    },
                    985,
                    { correlationId: failedCorrelationId }
                ),
            /forced ingredient merge audit failure/
        );

        const [rolledBack] = await connection.query(`SELECT source.Status AS SourceStatus, source.MergedIntoIngredientId, (SELECT COUNT(*) FROM RecipeIngredients WHERE IngredientId = 988) AS SourceRecipeCount, (SELECT COUNT(*) FROM RecipeIngredients WHERE IngredientId = 989) AS TargetRecipeCount, (SELECT COUNT(*) FROM IngredientAliases WHERE IngredientId = 989 AND NormalizedName = 'rollback ingredient source' AND LanguageCode = 'fr') AS SourceNameAliasCount, (SELECT COUNT(*) FROM AdminAuditLogs WHERE CorrelationId = ?) AS AuditCount FROM Ingredients AS source WHERE source.Id = 988`, [failedCorrelationId]);
        assert.deepEqual(rolledBack, [
            {
                SourceStatus: 'active',
                MergedIntoIngredientId: null,
                SourceRecipeCount: 1,
                TargetRecipeCount: 0,
                SourceNameAliasCount: 0,
                AuditCount: 0
            }
        ]);
    });

    it('rejects an alias collision without changing recipes, ingredients or audit history', async () => {
        await connection.query(`INSERT INTO Ingredients (Id, Name, NormalizedName, Slug) VALUES (990, 'Collision ingredient source', 'collision ingredient source', 'collision-ingredient-source'), (991, 'Collision ingredient target', 'collision ingredient target', 'collision-ingredient-target'), (992, 'Collision ingredient owner', 'collision ingredient owner', 'collision-ingredient-owner'); INSERT INTO IngredientAliases (Id, IngredientId, Name, NormalizedName, LanguageCode) VALUES (990, 992, 'Collision ingredient source', 'collision ingredient source', 'fr'); INSERT INTO RecipeIngredients (Id, RecipeId, IngredientId, DisplayText) VALUES (990, 985, 990, 'libellé auteur conservé après conflit')`);

        const repository = new AdminIngredientRepositoryMysql(pool);
        const service = new AdminIngredientService(repository, new AdminAuditActionRunnerMysql(pool, (db) => new AdminAuditService(new AdminAuditRepositoryMysql(db))));
        const correlationId = '00000000-0000-4000-8000-000000000990';
        await assert.rejects(
            () =>
                service.merge(
                    990,
                    {
                        targetIngredientId: 991,
                        reason: 'Le nom source entre en collision avec un alias tiers.'
                    },
                    985,
                    { correlationId }
                ),
            assertMergeSourceNameAliasConflict
        );

        const [unchangedState] = await connection.query(`SELECT source.Status AS SourceStatus, source.MergedIntoIngredientId, recipeIngredient.IngredientId AS RecipeIngredientId, recipeIngredient.DisplayText, alias.IngredientId AS AliasOwnerId, (SELECT COUNT(*) FROM AdminAuditLogs WHERE CorrelationId = ?) AS AuditCount FROM Ingredients AS source INNER JOIN RecipeIngredients AS recipeIngredient ON recipeIngredient.Id = 990 INNER JOIN IngredientAliases AS alias ON alias.Id = 990 WHERE source.Id = 990`, [correlationId]);
        assert.deepEqual(unchangedState, [
            {
                SourceStatus: 'active',
                MergedIntoIngredientId: null,
                RecipeIngredientId: 990,
                DisplayText: 'libellé auteur conservé après conflit',
                AliasOwnerId: 992,
                AuditCount: 0
            }
        ]);
    });

    it('serializes a concurrent recipe ingredient so it cannot recreate a merged source reference', async () => {
        await connection.query(`INSERT INTO Ingredients (Id, Name, NormalizedName, Slug) VALUES (995, 'Concurrent ingredient source', 'concurrent ingredient source', 'concurrent-ingredient-source'), (996, 'Concurrent ingredient target', 'concurrent ingredient target', 'concurrent-ingredient-target')`);
        const mergeDb = await pool.getConnection();
        const recipeDb = await pool.getConnection();

        try {
            await mergeDb.beginTransaction();
            await recipeDb.beginTransaction();
            const repository = new AdminIngredientRepositoryMysql(pool);
            await repository.findByIdsForUpdate([995, 996], mergeDb);

            const pendingAssociation = recipeDb
                .execute(`INSERT INTO RecipeIngredients (Id, RecipeId, IngredientId, DisplayText) VALUES (995, 985, 995, 'référence concurrente')`)
                .then(() => null, (error: unknown) => error);

            const result = await repository.merge(
                {
                    sourceIngredientId: 995,
                    targetIngredientId: 996,
                    sourceName: 'Concurrent ingredient source',
                    sourceNormalizedName: 'concurrent ingredient source',
                    sourceNameLanguageCode: 'fr'
                },
                mergeDb
            );
            assert.equal(result.status, 'merged');
            await mergeDb.commit();

            const associationError = await pendingAssociation;
            assert.ok(associationError instanceof Error);
            assert.match(
                (associationError as Error & { sqlMessage?: string }).sqlMessage ?? associationError.message,
                /Recipes can only reference active canonical ingredients/
            );
            await recipeDb.rollback();

            const [persistedState] = await connection.query(`SELECT source.Status AS SourceStatus, source.MergedIntoIngredientId, (SELECT COUNT(*) FROM RecipeIngredients WHERE IngredientId = 995) AS SourceRecipeCount, (SELECT COUNT(*) FROM RecipeIngredients WHERE IngredientId = 996) AS TargetRecipeCount FROM Ingredients AS source WHERE source.Id = 995`);
            assert.deepEqual(persistedState, [
                {
                    SourceStatus: 'merged',
                    MergedIntoIngredientId: 996,
                    SourceRecipeCount: 0,
                    TargetRecipeCount: 0
                }
            ]);
        } finally {
            await mergeDb.rollback();
            await recipeDb.rollback();
            mergeDb.release();
            recipeDb.release();
        }
    });

    it('rejects equivalent active names while preserving deprecated and merged variants', async () => {
        await connection.query(`INSERT INTO Ingredients (Id, Name, NormalizedName, Slug) VALUES (910, 'Crème brûlée', 'creme brulee', 'normalization-canonical-ingredient')`);

        const activeVariants = [
            { name: 'CRÈME BRÛLÉE', slug: 'normalization-ingredient-case' },
            { name: 'Creme brulee', slug: 'normalization-ingredient-accents' },
            { name: 'Crème   brûlée', slug: 'normalization-ingredient-spaces' },
            { name: 'Crème---brûlée!!!', slug: 'normalization-ingredient-punctuation' }
        ];

        for (const { name, slug } of activeVariants) {
            await assert.rejects(() => connection.query(`INSERT INTO Ingredients (Name, NormalizedName, Slug) VALUES (?, 'creme brulee', ?)`, [name, slug]), assertActiveNormalizedDuplicateRejected);
        }

        await connection.query(`INSERT INTO Ingredients (Id, Name, NormalizedName, Slug, Status) VALUES (911, 'Creme---brulee', 'creme brulee', 'normalization-ingredient-deprecated', 'deprecated'); INSERT INTO Ingredients (Id, Name, NormalizedName, Slug, Status, MergedIntoIngredientId) VALUES (912, 'CRÈME BRÛLÉE', 'creme brulee', 'normalization-ingredient-merged', 'merged', 910)`);

        await assert.rejects(() => connection.query(`UPDATE Ingredients SET Status = 'active' WHERE Id = 911`), assertActiveNormalizedDuplicateRejected);

        const [historicalVariants] = await connection.query(`SELECT Id, Status, MergedIntoIngredientId FROM Ingredients WHERE Id IN (911, 912) ORDER BY Id`);
        assert.deepEqual(historicalVariants, [
            { Id: 911, Status: 'deprecated', MergedIntoIngredientId: null },
            { Id: 912, Status: 'merged', MergedIntoIngredientId: 910 }
        ]);
    });

    it('enforces lifecycle coherence, merge references, metadata and non-destructive retention', async () => {
        await connection.query(`INSERT INTO Ingredients (Id, Name, NormalizedName, Slug, Status) VALUES (900, 'Canonical ingredient fixture', 'canonical ingredient fixture', 'canonical-ingredient-fixture', 'active'), (901, 'Deprecated ingredient fixture', 'deprecated ingredient fixture', 'deprecated-ingredient-fixture', 'deprecated'); INSERT INTO Ingredients (Id, Name, NormalizedName, Slug, Status, MergedIntoIngredientId) VALUES (902, 'Merged ingredient fixture', 'merged ingredient fixture', 'merged-ingredient-fixture', 'merged', 900)`);

        const repository = new IngredientRepositoryMysql(pool);
        const merged = await repository.findById(902);
        assert.equal(merged?.status, 'merged');
        assert.equal(merged?.mergedIntoIngredientId, 900);
        const publicIngredientIds = (await repository.findAll()).map(({ id }) => id);
        assert.ok(publicIngredientIds.includes(900));
        assert.equal(publicIngredientIds.includes(901), false);
        assert.equal(publicIngredientIds.includes(902), false);

        await connection.query(`UPDATE Ingredients SET Name = 'Canonical ingredient fixture updated', NormalizedName = 'canonical ingredient fixture updated' WHERE Id = 900`);
        const canonical = await repository.findById(900);
        assert.ok(canonical);
        assert.equal(canonical.name, 'Canonical ingredient fixture updated');
        assert.ok(canonical.updatedAt >= canonical.createdAt);

        await assert.rejects(() => connection.query(`INSERT INTO Ingredients (Name, NormalizedName, Slug, Status) VALUES ('Missing merge target', 'missing merge target', 'missing-ingredient-merge-target', 'merged')`));
        await assert.rejects(() => connection.query(`INSERT INTO Ingredients (Name, NormalizedName, Slug, Status, MergedIntoIngredientId) VALUES ('Unexpected merge target', 'unexpected merge target', 'unexpected-ingredient-merge-target', 'active', 900)`));
        await assert.rejects(() => connection.query(`INSERT INTO Ingredients (Id, Name, NormalizedName, Slug, Status, MergedIntoIngredientId) VALUES (903, 'Self ingredient merge', 'self ingredient merge', 'self-ingredient-merge', 'merged', 903)`));
        await assert.rejects(() => connection.query(`INSERT INTO Ingredients (Name, NormalizedName, Slug, Status, MergedIntoIngredientId) VALUES ('Unknown merge target', 'unknown merge target', 'unknown-ingredient-merge-target', 'merged', 999999)`));
        await assert.rejects(() => connection.query(`INSERT INTO Ingredients (Name, NormalizedName, Slug, Status, MergedIntoIngredientId) VALUES ('Deprecated merge target', 'deprecated merge target', 'deprecated-ingredient-merge-target', 'merged', 901)`));
        await assert.rejects(() => connection.query(`UPDATE Ingredients SET Status = 'deprecated' WHERE Id = 900`));
        await assert.rejects(() => connection.query(`INSERT INTO Ingredients (Name, NormalizedName, Slug) VALUES ('Mismatched normalized ingredient', 'another value', 'mismatched-normalized-ingredient')`));
        await assert.rejects(() => connection.query(`INSERT INTO Ingredients (Name, NormalizedName, Slug) VALUES ('Invalid ingredient slug', 'invalid ingredient slug', 'Invalid Ingredient Slug')`));
        await assert.rejects(() => connection.query(`DELETE FROM Ingredients WHERE Id = 901`), assertIngredientDeletionRejected);
    });

    it('accepts valid localized aliases and rejects normalized conflicts', async () => {
        await connection.query(`INSERT INTO Ingredients (Id, Name, NormalizedName, Slug) VALUES (920, 'Canonical alias target', 'canonical alias target', 'canonical-alias-target'), (921, 'Second canonical alias target', 'second canonical alias target', 'second-canonical-alias-target')`);

        await connection.query(`INSERT INTO IngredientAliases (IngredientId, Name, NormalizedName, LanguageCode) VALUES (920, 'Pois chiche', 'pois chiche', 'fr')`);

        const normalizedVariants = ['POIS CHICHE', 'Pois   chiche', 'Pois---chiche!!!'];
        for (const name of normalizedVariants) {
            await assert.rejects(() => connection.query(`INSERT INTO IngredientAliases (IngredientId, Name, NormalizedName, LanguageCode) VALUES (921, ?, 'pois chiche', 'fr')`, [name]), assertAliasNormalizedDuplicateRejected);
        }

        await connection.query(`INSERT INTO IngredientAliases (IngredientId, Name, NormalizedName, LanguageCode) VALUES (921, 'Pois chiche', 'pois chiche', 'en')`);

        const [aliases] = await connection.query(`SELECT IngredientId, Name, NormalizedName, LanguageCode FROM IngredientAliases WHERE NormalizedName = 'pois chiche' ORDER BY LanguageCode`);
        assert.deepEqual(aliases, [
            { IngredientId: 921, Name: 'Pois chiche', NormalizedName: 'pois chiche', LanguageCode: 'en' },
            { IngredientId: 920, Name: 'Pois chiche', NormalizedName: 'pois chiche', LanguageCode: 'fr' }
        ]);
    });

    it('only allows aliases of active canonical ingredients', async () => {
        await connection.query(`INSERT INTO Ingredients (Id, Name, NormalizedName, Slug, Status) VALUES (930, 'Active alias fixture', 'active alias fixture', 'active-alias-fixture', 'active'), (931, 'Deprecated alias fixture', 'deprecated alias fixture', 'deprecated-alias-fixture', 'deprecated'), (933, 'Independent alias fixture', 'independent alias fixture', 'independent-alias-fixture', 'active'); INSERT INTO Ingredients (Id, Name, NormalizedName, Slug, Status, MergedIntoIngredientId) VALUES (932, 'Merged alias fixture', 'merged alias fixture', 'merged-alias-fixture', 'merged', 930)`);

        await assert.rejects(() => connection.query(`INSERT INTO IngredientAliases (IngredientId, Name, NormalizedName, LanguageCode) VALUES (999999, 'Unknown target alias', 'unknown target alias', 'fr')`), assertAliasTargetRejected);
        await assert.rejects(() => connection.query(`INSERT INTO IngredientAliases (IngredientId, Name, NormalizedName, LanguageCode) VALUES (931, 'Deprecated target alias', 'deprecated target alias', 'fr')`), assertAliasTargetRejected);
        await assert.rejects(() => connection.query(`INSERT INTO IngredientAliases (IngredientId, Name, NormalizedName, LanguageCode) VALUES (932, 'Merged target alias', 'merged target alias', 'fr')`), assertAliasTargetRejected);

        await connection.query(`INSERT INTO IngredientAliases (IngredientId, Name, NormalizedName, LanguageCode) VALUES (933, 'Valid target alias', 'valid target alias', 'fr')`);
        await assert.rejects(() => connection.query(`UPDATE IngredientAliases SET IngredientId = 931 WHERE NormalizedName = 'valid target alias' AND LanguageCode = 'fr'`), assertAliasTargetRejected);
        await assert.rejects(
            () => connection.query(`UPDATE Ingredients SET Status = 'deprecated' WHERE Id = 933`),
            (error: unknown) => {
                assert.ok(error instanceof Error);
                const mysqlError = error as Error & { errno?: number; sqlMessage?: string };
                assert.equal(mysqlError.errno, 1644);
                assert.equal(mysqlError.sqlMessage, 'An ingredient with aliases must remain active');
                return true;
            }
        );
    });

    it('validates alias names, normalized names and language codes', async () => {
        await connection.query(`INSERT INTO Ingredients (Id, Name, NormalizedName, Slug) VALUES (940, 'Alias validation fixture', 'alias validation fixture', 'alias-validation-fixture')`);

        const invalidAliases = [
            { name: '   ', normalizedName: 'blank alias', languageCode: 'fr' },
            { name: 'Mismatched alias', normalizedName: 'another value', languageCode: 'fr' },
            { name: 'Uppercase language', normalizedName: 'uppercase language', languageCode: 'FR' },
            { name: 'Malformed language', normalizedName: 'malformed language', languageCode: 'fr_' }
        ];

        for (const alias of invalidAliases) {
            await assert.rejects(() =>
                connection.query(
                    `INSERT INTO IngredientAliases (IngredientId, Name, NormalizedName, LanguageCode)
                 VALUES (940, ?, ?, ?)`,
                    [alias.name, alias.normalizedName, alias.languageCode]
                )
            );
        }
    });
});
