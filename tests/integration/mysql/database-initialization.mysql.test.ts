import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import mysql from 'mysql2/promise';

import { CategoryRepositoryMysql } from '../../../src/repositories/category/category.repository.mysql.js';
import { EquipmentRepositoryMysql } from '../../../src/repositories/equipments/equipment.repository.mysql.js';
import { IngredientRepositoryMysql } from '../../../src/repositories/ingredients/ingredient.repository.mysql.js';
import { RbacRepositoryMysql } from '../../../src/repositories/rbac/rbac.repository.mysql.js';
import { TagRepositoryMysql } from '../../../src/repositories/tag/tag.repository.mysql.js';
import { PERMISSIONS } from '../../../src/security/permissions.js';
import { env } from '../../../src/utils/env.js';

import type { Pool } from 'mysql2/promise';

const baseTestDatabaseName = process.env.TEST_DB_NAME?.trim() ?? '';
const mysqlEnabled = Boolean(baseTestDatabaseName);

const EXPECTED_TABLES = [
    'adminauditlogs',
    'catalogproposals',
    'commentmoderationlogs',
    'comments',
    'communityprofiles',
    'communitysessions',
    'emailvalidations',
    'equipments',
    'favorites',
    'ingredientaliases',
    'ingredients',
    'passwordresets',
    'permissions',
    'recipecategories',
    'recipeequipments',
    'recipeimages',
    'recipeingredients',
    'recipemoderationlogs',
    'recipes',
    'recipesteps',
    'recipetags',
    'rolepermissions',
    'roles',
    'staffinvitations',
    'staffmoderationlogs',
    'staffprivilegechangerequests',
    'staffprofiles',
    'staffroles',
    'staffsessions',
    'staffwebauthnchallenges',
    'staffwebauthncredentials',
    'taggroups',
    'tags',
    'usermoderationlogs',
    'users'
].sort();

const EXPECTED_SEED_COUNTS: Record<string, number> = {
    roles: 5,
    permissions: 35,
    rolepermissions: 59,
    recipecategories: 6,
    ingredients: 277,
    taggroups: 8,
    tags: 71,
    equipments: 83
};

const EXPECTED_ROLE_CODES = [
    'CatalogManager',
    'CommentModerator',
    'RecipeModerator',
    'SuperAdmin',
    'UserAdmin'
];

const EXPECTED_CONSTRAINT_COUNT = 175;
const EXPECTED_DECLARED_INDEX_COUNT = 128;
const EXPECTED_EFFECTIVE_INDEX_COUNT = 132;
const EXPECTED_TRIGGER_COUNT = 40;

type SchemaInventory = {
    tables: string[];
    constraints: string[];
    indexes: string[];
    triggers: string[];
};

function requireInitializationTestDatabaseName(): string {
    if (!/^[a-zA-Z0-9_]+$/.test(baseTestDatabaseName))
        throw new Error('TEST_DB_NAME must contain only letters, numbers and underscores');
    if (!baseTestDatabaseName.toLowerCase().includes('test'))
        throw new Error('TEST_DB_NAME must contain "test"');
    if (baseTestDatabaseName === env.db.name)
        throw new Error('TEST_DB_NAME must be different from DB_NAME');

    const databaseName = `${baseTestDatabaseName}_initialization`;
    if (databaseName.length > 64)
        throw new Error('TEST_DB_NAME is too long for the initialization integration database suffix');
    return databaseName;
}

function targetDatabase(sql: string, databaseName: string): string {
    return sql.replace(/USE\s+recipe_shelter\s*;/i, `USE \`${databaseName}\`;`);
}

function schemaObjectKey(tableName: string, objectName: string): string {
    return `${tableName.toLowerCase()}:${objectName.toLowerCase()}`;
}

function extractSchemaInventory(schema: string): SchemaInventory {
    const inventory: SchemaInventory = {
        tables: [],
        constraints: [],
        indexes: [],
        triggers: []
    };

    for (const match of schema.matchAll(
        /CREATE\s+TABLE\s+`?([a-zA-Z0-9_]+)`?\s*\(([\s\S]*?)\)\s*ENGINE=/gi
    )) {
        const tableName = match[1];
        const tableBody = match[2];
        if (!tableName || tableBody === undefined)
            throw new Error('Unable to read a CREATE TABLE statement from the structural schema');

        inventory.tables.push(tableName);

        if (/\bPRIMARY\s+KEY\b/i.test(tableBody)) {
            inventory.constraints.push(schemaObjectKey(tableName, 'PRIMARY'));
            inventory.indexes.push(schemaObjectKey(tableName, 'PRIMARY'));
        }

        for (const uniqueKey of tableBody.matchAll(
            /(?:^|,)\s*UNIQUE\s+(?:KEY|INDEX)\s+`?([a-zA-Z0-9_]+)`?/gim
        )) {
            const name = uniqueKey[1];
            if (!name)
                throw new Error(`Unable to read a unique key declared on ${tableName}`);
            inventory.constraints.push(schemaObjectKey(tableName, name));
        }

        for (const constraint of tableBody.matchAll(/\bCONSTRAINT\s+`?([a-zA-Z0-9_]+)`?/gi)) {
            const name = constraint[1];
            if (!name)
                throw new Error(`Unable to read a constraint declared on ${tableName}`);
            inventory.constraints.push(schemaObjectKey(tableName, name));
        }

        for (const index of tableBody.matchAll(
            /(?:^|,)\s*(?:UNIQUE\s+|FULLTEXT\s+)?(?:KEY|INDEX)\s+`?([a-zA-Z0-9_]+)`?/gim
        )) {
            const name = index[1];
            if (!name)
                throw new Error(`Unable to read an index declared on ${tableName}`);
            inventory.indexes.push(schemaObjectKey(tableName, name));
        }
    }

    for (const trigger of schema.matchAll(/CREATE\s+TRIGGER\s+`?([a-zA-Z0-9_]+)`?/gi)) {
        const name = trigger[1];
        if (!name)
            throw new Error('Unable to read a trigger declared in the structural schema');
        inventory.triggers.push(name.toLowerCase());
    }

    return inventory;
}

function extractSeedTargets(seed: string): string[] {
    return [...seed.matchAll(/^\s*INSERT\s+INTO\s+`?([a-zA-Z0-9_]+)`?/gim)]
        .map((match) => match[1]?.toLowerCase())
        .filter((tableName): tableName is string => Boolean(tableName));
}

async function readTableCounts(
    connection: mysql.Connection,
    tableNames: string[]
): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};

    for (const tableName of tableNames) {
        if (!/^[a-zA-Z0-9_]+$/.test(tableName))
            throw new Error(`Unsafe schema table name: ${tableName}`);
        const [rows] = await connection.query(`SELECT COUNT(*) AS RowCount FROM \`${tableName}\``);
        const row = (rows as Array<{ RowCount: number | string }>)[0];
        counts[tableName.toLowerCase()] = Number(row?.RowCount ?? 0);
    }

    return counts;
}

async function readSeedState(connection: mysql.Connection): Promise<Record<string, unknown[]>> {
    const queries: Record<string, string> = {
        Roles: 'SELECT Id, Code, Name, Description FROM Roles ORDER BY Id',
        Permissions: 'SELECT Id, Code, Description FROM Permissions ORDER BY Id',
        RolePermissions: 'SELECT RoleId, PermissionId FROM RolePermissions ORDER BY RoleId, PermissionId',
        RecipeCategories: 'SELECT Id, Name, Slug, IconName FROM RecipeCategories ORDER BY Id',
        Ingredients: `SELECT Id, Name, NormalizedName, Slug, Status, MergedIntoIngredientId
                      FROM Ingredients ORDER BY Id`,
        TagGroups: 'SELECT Id, Name, Slug, SortOrder FROM TagGroups ORDER BY Id',
        Tags: `SELECT Id, GroupId, Name, NormalizedName, Slug, Description, Status, MergedIntoTagId
               FROM Tags ORDER BY Id`,
        Equipments: 'SELECT Id, Name, Slug FROM Equipments ORDER BY Id'
    };
    const state: Record<string, unknown[]> = {};

    for (const [tableName, query] of Object.entries(queries)) {
        const [rows] = await connection.query(query);
        state[tableName] = rows as unknown[];
    }

    return state;
}

describe(
    'complete database initialization',
    { concurrency: false, skip: !mysqlEnabled && 'Set TEST_DB_NAME to run isolated MySQL tests' },
    () => {
        let connection: mysql.Connection;
        let pool: Pool;
        let schema: string;
        let seed: string;
        let inventory: SchemaInventory;

        before(async () => {
            const databaseName = requireInitializationTestDatabaseName();
            connection = await mysql.createConnection({
                host: env.db.host,
                port: env.db.port,
                user: env.db.user,
                password: env.db.password,
                multipleStatements: true
            });

            await connection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
            await connection.query(
                `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
            );

            const schemaPath = new URL('../../../database/migrations/1_create_schema.sql', import.meta.url);
            const seedPath = new URL('../../../database/seed.sql', import.meta.url);
            schema = await readFile(schemaPath, 'utf8');
            seed = await readFile(seedPath, 'utf8');
            inventory = extractSchemaInventory(schema);

            await connection.query(targetDatabase(schema, databaseName));
            pool = mysql.createPool({
                host: env.db.host,
                port: env.db.port,
                user: env.db.user,
                password: env.db.password,
                database: databaseName,
                connectionLimit: 3,
                timezone: 'Z'
            });
        });

        after(async () => {
            if (connection) {
                if (pool)
                    await pool.end();
                await connection.query(
                    `DROP DATABASE IF EXISTS \`${requireInitializationTestDatabaseName()}\``
                );
                await connection.end();
            }
        });

        it('creates only the complete final structure on an empty database', async () => {
            const databaseName = requireInitializationTestDatabaseName();
            const [tableRows] = await connection.query(
                `SELECT TABLE_NAME AS TableName, ENGINE AS Engine, TABLE_COLLATION AS TableCollation
                 FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
                 ORDER BY TABLE_NAME`,
                [databaseName]
            );
            const tables = tableRows as Array<{
                TableName: string;
                Engine: string;
                TableCollation: string;
            }>;

            assert.deepEqual(
                inventory.tables.map((tableName) => tableName.toLowerCase()).sort(),
                EXPECTED_TABLES
            );
            assert.deepEqual(
                tables.map(({ TableName }) => TableName.toLowerCase()).sort(),
                EXPECTED_TABLES
            );
            assert.ok(tables.every(({ Engine }) => Engine.toLowerCase() === 'innodb'));
            assert.ok(tables.every(({ TableCollation }) => TableCollation === 'utf8mb4_unicode_ci'));

            const emptyCounts = await readTableCounts(connection, inventory.tables);
            assert.deepEqual(
                emptyCounts,
                Object.fromEntries(EXPECTED_TABLES.map((tableName) => [tableName, 0]))
            );

            const [constraintRows] = await connection.query(
                `SELECT TABLE_NAME AS TableName, CONSTRAINT_NAME AS ConstraintName,
                        CONSTRAINT_TYPE AS ConstraintType
                 FROM information_schema.TABLE_CONSTRAINTS
                 WHERE CONSTRAINT_SCHEMA = ?
                 ORDER BY TABLE_NAME, CONSTRAINT_NAME`,
                [databaseName]
            );
            const constraints = constraintRows as Array<{
                TableName: string;
                ConstraintName: string;
                ConstraintType: string;
            }>;
            const actualConstraints = constraints
                .map(({ TableName, ConstraintName }) => schemaObjectKey(TableName, ConstraintName))
                .sort();

            assert.equal(inventory.constraints.length, EXPECTED_CONSTRAINT_COUNT);
            assert.equal(new Set(inventory.constraints).size, inventory.constraints.length);
            assert.deepEqual(actualConstraints, [...inventory.constraints].sort());

            const [indexRows] = await connection.query(
                `SELECT TABLE_NAME AS TableName, INDEX_NAME AS IndexName
                 FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = ?
                 GROUP BY TABLE_NAME, INDEX_NAME
                 ORDER BY TABLE_NAME, INDEX_NAME`,
                [databaseName]
            );
            const actualIndexes = (indexRows as Array<{ TableName: string; IndexName: string }>)
                .map(({ TableName, IndexName }) => schemaObjectKey(TableName, IndexName))
                .sort();
            const declaredIndexes = new Set(inventory.indexes);
            const foreignKeys = new Set(
                constraints
                    .filter(({ ConstraintType }) => ConstraintType === 'FOREIGN KEY')
                    .map(({ TableName, ConstraintName }) => schemaObjectKey(TableName, ConstraintName))
            );
            const implicitIndexes = actualIndexes.filter((index) => !declaredIndexes.has(index));

            assert.equal(inventory.indexes.length, EXPECTED_DECLARED_INDEX_COUNT);
            assert.equal(new Set(inventory.indexes).size, inventory.indexes.length);
            assert.ok(inventory.indexes.every((index) => actualIndexes.includes(index)));
            assert.equal(actualIndexes.length, EXPECTED_EFFECTIVE_INDEX_COUNT);
            assert.ok(implicitIndexes.every((index) => foreignKeys.has(index)));

            const [triggerRows] = await connection.query(
                `SELECT TRIGGER_NAME AS TriggerName
                 FROM information_schema.TRIGGERS
                 WHERE TRIGGER_SCHEMA = ?
                 ORDER BY TRIGGER_NAME`,
                [databaseName]
            );
            const actualTriggers = (triggerRows as Array<{ TriggerName: string }>)
                .map(({ TriggerName }) => TriggerName.toLowerCase())
                .sort();

            assert.equal(inventory.triggers.length, EXPECTED_TRIGGER_COUNT);
            assert.equal(new Set(inventory.triggers).size, inventory.triggers.length);
            assert.deepEqual(actualTriggers, [...inventory.triggers].sort());
        });

        it('adds the coherent initial data, remains idempotent and is backend-compatible', async () => {
            const seedTargets = extractSeedTargets(seed);
            assert.deepEqual(
                [...new Set(seedTargets)].sort(),
                Object.keys(EXPECTED_SEED_COUNTS).sort()
            );
            assert.equal(new Set(seedTargets).size, seedTargets.length);

            await connection.query(targetDatabase(seed, requireInitializationTestDatabaseName()));

            const seededCounts = await readTableCounts(connection, inventory.tables);
            const expectedCounts = Object.fromEntries(
                EXPECTED_TABLES.map((tableName) => [tableName, EXPECTED_SEED_COUNTS[tableName] ?? 0])
            );
            assert.deepEqual(seededCounts, expectedCounts);

            const [roleRows] = await connection.query('SELECT Code FROM Roles ORDER BY Code');
            assert.deepEqual(
                (roleRows as Array<{ Code: string }>).map(({ Code }) => Code),
                EXPECTED_ROLE_CODES
            );

            const [permissionRows] = await connection.query('SELECT Code FROM Permissions ORDER BY Code');
            assert.deepEqual(
                (permissionRows as Array<{ Code: string }>).map(({ Code }) => Code),
                [...Object.values(PERMISSIONS)].sort()
            );

            const [coherenceRows] = await connection.query(
                `SELECT
                    (SELECT COUNT(*) FROM Roles
                     WHERE TRIM(Code) = '' OR TRIM(Name) = '' OR TRIM(Description) = '') AS InvalidRoles,
                    (SELECT COUNT(*) FROM Permissions
                     WHERE TRIM(Code) = '' OR TRIM(Description) = '') AS InvalidPermissions,
                    (SELECT COUNT(*) FROM Ingredients
                     WHERE Status <> 'active' OR MergedIntoIngredientId IS NOT NULL
                        OR TRIM(Name) = '' OR TRIM(NormalizedName) = '' OR TRIM(Slug) = '') AS InvalidIngredients,
                    (SELECT COUNT(*) FROM Tags
                     WHERE Status <> 'active' OR MergedIntoTagId IS NOT NULL
                        OR TRIM(Name) = '' OR TRIM(NormalizedName) = '' OR TRIM(Slug) = '') AS InvalidTags,
                    (SELECT COUNT(*) FROM RolePermissions AS rp
                     LEFT JOIN Roles AS r ON r.Id = rp.RoleId
                     LEFT JOIN Permissions AS p ON p.Id = rp.PermissionId
                     WHERE r.Id IS NULL OR p.Id IS NULL) AS InvalidRolePermissions,
                    (SELECT COUNT(*) FROM Tags AS t
                     LEFT JOIN TagGroups AS tg ON tg.Id = t.GroupId
                     WHERE tg.Id IS NULL) AS InvalidTagGroups,
                    (SELECT COUNT(*) FROM RolePermissions AS rp
                     INNER JOIN Roles AS r ON r.Id = rp.RoleId
                     WHERE r.Code = 'SuperAdmin') AS SuperAdminPermissions`
            );
            assert.deepEqual(coherenceRows, [{
                InvalidRoles: 0,
                InvalidPermissions: 0,
                InvalidIngredients: 0,
                InvalidTags: 0,
                InvalidRolePermissions: 0,
                InvalidTagGroups: 0,
                SuperAdminPermissions: Object.values(PERMISSIONS).length
            }]);

            const categoriesRepository = new CategoryRepositoryMysql(pool);
            const ingredientsRepository = new IngredientRepositoryMysql(pool);
            const tagsRepository = new TagRepositoryMysql(pool);
            const equipmentsRepository = new EquipmentRepositoryMysql(pool);
            const [categories, ingredients, tags, equipments] = await Promise.all([
                categoriesRepository.findAll(),
                ingredientsRepository.findAll(),
                tagsRepository.findAll(),
                equipmentsRepository.findAll()
            ]);

            assert.equal(categories.length, EXPECTED_SEED_COUNTS.recipecategories);
            assert.equal(ingredients.length, EXPECTED_SEED_COUNTS.ingredients);
            assert.equal(tags.length, EXPECTED_SEED_COUNTS.tags);
            assert.equal(equipments.length, EXPECTED_SEED_COUNTS.equipments);
            assert.ok(categories[0]);
            assert.ok(ingredients[0]);
            assert.ok(tags[0]);
            assert.ok(equipments[0]);
            assert.ok(await categoriesRepository.findById(categories[0].id));
            assert.ok(await ingredientsRepository.findById(ingredients[0].id));
            assert.ok(await tagsRepository.findById(tags[0].id));
            assert.ok(await equipmentsRepository.findById(equipments[0].id));
            assert.deepEqual(
                await new RbacRepositoryMysql(pool).findPermissionCodesByStaffUserId(999_999),
                []
            );

            const seedState = await readSeedState(connection);
            await connection.query(targetDatabase(seed, requireInitializationTestDatabaseName()));
            assert.deepEqual(await readSeedState(connection), seedState);
            assert.deepEqual(await readTableCounts(connection, inventory.tables), expectedCounts);

            await connection.query(
                `INSERT INTO Users (Id, Mail, Username, Password, AccountType, Status)
                 VALUES (999001, 'isolated-staff@test.local', 'isolated-staff', 'test-hash', 'staff', 'inactive')`
            );
            await assert.rejects(() => connection.query(
                `UPDATE Users SET Status = 'active' WHERE Id = 999001`
            ));
            await assert.rejects(() => connection.query(
                `INSERT INTO Recipes
                    (Id, UserId, CategoryId, Title, Slug, Description, PrepTimeMinutes, Servings)
                 SELECT 999001, 999001, MIN(Id), 'Forbidden staff recipe', 'forbidden-staff-recipe',
                        'Staff accounts cannot own community recipes', 5, 2
                 FROM RecipeCategories`
            ));
            await assert.rejects(() => connection.query(
                `INSERT INTO RolePermissions (RoleId, PermissionId)
                 SELECT RoleId, PermissionId FROM RolePermissions LIMIT 1`
            ));
        });
    }
);
