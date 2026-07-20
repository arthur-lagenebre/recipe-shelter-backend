import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import mysql from 'mysql2/promise';

import { IngredientRepositoryMysql } from '../../../src/repositories/ingredients/ingredient.repository.mysql.js';
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

function assertIngredientDeletionRejected(error: unknown): boolean {
    assert.ok(error instanceof Error);

    const mysqlError = error as Error & {
        errno?: number;
        sqlMessage?: string;
        sqlState?: string;
    };

    assert.equal(mysqlError.errno, 1644);
    assert.equal(mysqlError.sqlState, '45000');
    assert.equal(
        mysqlError.sqlMessage,
        'Ingredients cannot be physically deleted; deprecate or merge them instead'
    );
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
        await connection.query(
            `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );

        const schemaPath = new URL('../../../database/migrations/1_create_schema.sql', import.meta.url);
        const seedPath = new URL('../../../database/seed.sql', import.meta.url);
        const schema = targetDatabase(await readFile(schemaPath, 'utf8'), databaseName);
        seed = targetDatabase(await readFile(seedPath, 'utf8'), databaseName);

        await connection.query(schema);
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
        const [columns] = await connection.query(
            `SELECT COLUMN_NAME AS ColumnName, COLUMN_TYPE AS ColumnType, IS_NULLABLE AS IsNullable,
                    COLUMN_DEFAULT AS ColumnDefault
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Ingredients'
             ORDER BY ORDINAL_POSITION`,
            [databaseName]
        );

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

        const [indexes] = await connection.query(
            `SELECT DISTINCT INDEX_NAME AS IndexName
             FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Ingredients'
             ORDER BY INDEX_NAME`,
            [databaseName]
        );
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
        assert.deepEqual({
            name: freshCream.name,
            normalizedName: freshCream.normalizedName,
            status: freshCream.status,
            mergedIntoIngredientId: freshCream.mergedIntoIngredientId
        }, {
            name: 'Crème fraîche',
            normalizedName: 'creme fraiche',
            status: 'active',
            mergedIntoIngredientId: null
        });
        assert.ok(freshCream.createdAt instanceof Date);
        assert.ok(freshCream.updatedAt instanceof Date);
    });

    it('rejects equivalent active names while preserving deprecated and merged variants', async () => {
        await connection.query(
            `INSERT INTO Ingredients (Id, Name, NormalizedName, Slug)
             VALUES (910, 'Crème brûlée', 'creme brulee', 'normalization-canonical-ingredient')`
        );

        const activeVariants = [
            { name: 'CRÈME BRÛLÉE', slug: 'normalization-ingredient-case' },
            { name: 'Creme brulee', slug: 'normalization-ingredient-accents' },
            { name: 'Crème   brûlée', slug: 'normalization-ingredient-spaces' },
            { name: 'Crème---brûlée!!!', slug: 'normalization-ingredient-punctuation' }
        ];

        for (const { name, slug } of activeVariants) {
            await assert.rejects(
                () => connection.query(
                    `INSERT INTO Ingredients (Name, NormalizedName, Slug)
                     VALUES (?, 'creme brulee', ?)`,
                    [name, slug]
                ),
                assertActiveNormalizedDuplicateRejected
            );
        }

        await connection.query(
            `INSERT INTO Ingredients (Id, Name, NormalizedName, Slug, Status) VALUES
               (911, 'Creme---brulee', 'creme brulee', 'normalization-ingredient-deprecated', 'deprecated');
             INSERT INTO Ingredients (Id, Name, NormalizedName, Slug, Status, MergedIntoIngredientId)
             VALUES (912, 'CRÈME BRÛLÉE', 'creme brulee', 'normalization-ingredient-merged', 'merged', 910)`
        );

        await assert.rejects(
            () => connection.query(`UPDATE Ingredients SET Status = 'active' WHERE Id = 911`),
            assertActiveNormalizedDuplicateRejected
        );

        const [historicalVariants] = await connection.query(
            `SELECT Id, Status, MergedIntoIngredientId
             FROM Ingredients
             WHERE Id IN (911, 912)
             ORDER BY Id`
        );
        assert.deepEqual(historicalVariants, [
            { Id: 911, Status: 'deprecated', MergedIntoIngredientId: null },
            { Id: 912, Status: 'merged', MergedIntoIngredientId: 910 }
        ]);
    });

    it('enforces lifecycle coherence, merge references, metadata and non-destructive retention', async () => {
        await connection.query(
            `INSERT INTO Ingredients (Id, Name, NormalizedName, Slug, Status) VALUES
               (900, 'Canonical ingredient fixture', 'canonical ingredient fixture', 'canonical-ingredient-fixture', 'active'),
               (901, 'Deprecated ingredient fixture', 'deprecated ingredient fixture', 'deprecated-ingredient-fixture', 'deprecated');
             INSERT INTO Ingredients (Id, Name, NormalizedName, Slug, Status, MergedIntoIngredientId)
             VALUES (902, 'Merged ingredient fixture', 'merged ingredient fixture', 'merged-ingredient-fixture', 'merged', 900)`
        );

        const repository = new IngredientRepositoryMysql(pool);
        const merged = await repository.findById(902);
        assert.equal(merged?.status, 'merged');
        assert.equal(merged?.mergedIntoIngredientId, 900);
        const publicIngredientIds = (await repository.findAll()).map(({ id }) => id);
        assert.ok(publicIngredientIds.includes(900));
        assert.equal(publicIngredientIds.includes(901), false);
        assert.equal(publicIngredientIds.includes(902), false);

        await connection.query(
            `UPDATE Ingredients
             SET Name = 'Canonical ingredient fixture updated',
                 NormalizedName = 'canonical ingredient fixture updated'
             WHERE Id = 900`
        );
        const canonical = await repository.findById(900);
        assert.ok(canonical);
        assert.equal(canonical.name, 'Canonical ingredient fixture updated');
        assert.ok(canonical.updatedAt >= canonical.createdAt);

        await assert.rejects(() => connection.query(
            `INSERT INTO Ingredients (Name, NormalizedName, Slug, Status)
             VALUES ('Missing merge target', 'missing merge target', 'missing-ingredient-merge-target', 'merged')`
        ));
        await assert.rejects(() => connection.query(
            `INSERT INTO Ingredients (Name, NormalizedName, Slug, Status, MergedIntoIngredientId)
             VALUES ('Unexpected merge target', 'unexpected merge target', 'unexpected-ingredient-merge-target', 'active', 900)`
        ));
        await assert.rejects(() => connection.query(
            `INSERT INTO Ingredients (Id, Name, NormalizedName, Slug, Status, MergedIntoIngredientId)
             VALUES (903, 'Self ingredient merge', 'self ingredient merge', 'self-ingredient-merge', 'merged', 903)`
        ));
        await assert.rejects(() => connection.query(
            `INSERT INTO Ingredients (Name, NormalizedName, Slug, Status, MergedIntoIngredientId)
             VALUES ('Unknown merge target', 'unknown merge target', 'unknown-ingredient-merge-target', 'merged', 999999)`
        ));
        await assert.rejects(() => connection.query(
            `INSERT INTO Ingredients (Name, NormalizedName, Slug, Status, MergedIntoIngredientId)
             VALUES ('Deprecated merge target', 'deprecated merge target', 'deprecated-ingredient-merge-target', 'merged', 901)`
        ));
        await assert.rejects(() => connection.query(
            `UPDATE Ingredients SET Status = 'deprecated' WHERE Id = 900`
        ));
        await assert.rejects(() => connection.query(
            `INSERT INTO Ingredients (Name, NormalizedName, Slug)
             VALUES ('Mismatched normalized ingredient', 'another value', 'mismatched-normalized-ingredient')`
        ));
        await assert.rejects(() => connection.query(
            `INSERT INTO Ingredients (Name, NormalizedName, Slug)
             VALUES ('Invalid ingredient slug', 'invalid ingredient slug', 'Invalid Ingredient Slug')`
        ));
        await assert.rejects(
            () => connection.query(`DELETE FROM Ingredients WHERE Id = 901`),
            assertIngredientDeletionRejected
        );
    });
});
