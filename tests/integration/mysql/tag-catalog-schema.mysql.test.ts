import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import mysql from 'mysql2/promise';

import { TagRepositoryMysql } from '../../../src/repositories/tag/tag.repository.mysql.js';
import { env } from '../../../src/utils/env.js';

const baseTestDatabaseName = process.env.TEST_DB_NAME?.trim() ?? '';
const mysqlEnabled = Boolean(baseTestDatabaseName);

function requireTagCatalogTestDatabaseName(): string {
    if (!/^[a-zA-Z0-9_]+$/.test(baseTestDatabaseName))
        throw new Error('TEST_DB_NAME must contain only letters, numbers and underscores');
    if (!baseTestDatabaseName.toLowerCase().includes('test'))
        throw new Error('TEST_DB_NAME must contain "test"');
    if (baseTestDatabaseName === env.db.name)
        throw new Error('TEST_DB_NAME must be different from DB_NAME');

    const databaseName = `${baseTestDatabaseName}_tag_catalog`;
    if (databaseName.length > 64)
        throw new Error('TEST_DB_NAME is too long for the tag catalog integration database suffix');
    return databaseName;
}

function targetDatabase(sql: string, databaseName: string): string {
    return sql.replace(/USE\s+recipe_shelter\s*;/i, `USE \`${databaseName}\`;`);
}

function assertTagDeletionRejected(error: unknown): boolean {
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
        'Tags cannot be physically deleted; deprecate or merge them instead'
    );
    return true;
}

describe('tag catalog schema integration', { skip: !mysqlEnabled && 'Set TEST_DB_NAME to run isolated MySQL tests' }, () => {
    let connection: mysql.Connection;
    let pool: mysql.Pool;
    let seed: string;

    before(async () => {
        const databaseName = requireTagCatalogTestDatabaseName();
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
            await connection.query(`DROP DATABASE IF EXISTS \`${requireTagCatalogTestDatabaseName()}\``);
            await connection.end();
        }
    });

    it('builds the final tag model from an empty database and the central seed', async () => {
        const databaseName = requireTagCatalogTestDatabaseName();
        const [columns] = await connection.query(
            `SELECT COLUMN_NAME AS ColumnName, COLUMN_TYPE AS ColumnType, IS_NULLABLE AS IsNullable,
                    COLUMN_DEFAULT AS ColumnDefault
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Tags'
             ORDER BY ORDINAL_POSITION`,
            [databaseName]
        );

        assert.deepEqual(columns, [
            { ColumnName: 'Id', ColumnType: 'bigint unsigned', IsNullable: 'NO', ColumnDefault: null },
            { ColumnName: 'GroupId', ColumnType: 'bigint unsigned', IsNullable: 'NO', ColumnDefault: null },
            { ColumnName: 'Name', ColumnType: 'varchar(255)', IsNullable: 'NO', ColumnDefault: null },
            { ColumnName: 'NormalizedName', ColumnType: 'varchar(255)', IsNullable: 'NO', ColumnDefault: null },
            { ColumnName: 'Slug', ColumnType: 'varchar(255)', IsNullable: 'NO', ColumnDefault: null },
            { ColumnName: 'Description', ColumnType: 'varchar(1000)', IsNullable: 'YES', ColumnDefault: null },
            { ColumnName: 'Status', ColumnType: "enum('active','deprecated','merged')", IsNullable: 'NO', ColumnDefault: 'active' },
            { ColumnName: 'MergedIntoTagId', ColumnType: 'bigint unsigned', IsNullable: 'YES', ColumnDefault: null },
            { ColumnName: 'CreatedAt', ColumnType: 'datetime', IsNullable: 'NO', ColumnDefault: 'CURRENT_TIMESTAMP' },
            { ColumnName: 'UpdatedAt', ColumnType: 'datetime', IsNullable: 'NO', ColumnDefault: 'CURRENT_TIMESTAMP' }
        ]);

        const [indexes] = await connection.query(
            `SELECT DISTINCT INDEX_NAME AS IndexName
             FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Tags'
             ORDER BY INDEX_NAME`,
            [databaseName]
        );
        assert.deepEqual(
            (indexes as Array<{ IndexName: string }>).map(({ IndexName }) => IndexName),
            [
                'idx_tags_group_status_name',
                'idx_tags_merged_into_tag_id',
                'idx_tags_status_name',
                'PRIMARY',
                'tags_normalized_name_UK',
                'tags_slug_UK'
            ]
        );

        const [beforeSecondSeed] = await connection.query(`SELECT COUNT(*) AS TagCount FROM Tags`);
        await connection.query(seed);
        const [afterSecondSeed] = await connection.query(`SELECT COUNT(*) AS TagCount FROM Tags`);
        assert.deepEqual(afterSecondSeed, beforeSecondSeed);

        const tags = await new TagRepositoryMysql(pool).findAll();
        const vegetarian = tags.find(({ slug }) => slug === 'vegetarien');
        assert.ok(vegetarian);
        assert.deepEqual({
            name: vegetarian.name,
            normalizedName: vegetarian.normalizedName,
            description: vegetarian.description,
            status: vegetarian.status,
            mergedIntoTagId: vegetarian.mergedIntoTagId,
            groupSlug: vegetarian.group.slug
        }, {
            name: 'Végétarien',
            normalizedName: 'vegetarien',
            description: null,
            status: 'active',
            mergedIntoTagId: null,
            groupSlug: 'regimes-alimentaires'
        });
        assert.ok(vegetarian.createdAt instanceof Date);
        assert.ok(vegetarian.updatedAt instanceof Date);
    });

    it('enforces canonical identity, lifecycle coherence, merge references and non-destructive retention', async () => {
        await connection.query(
            `INSERT INTO Tags (Id, GroupId, Name, NormalizedName, Slug, Description, Status) VALUES
               (900, 1, 'Canonical fixture', 'canonical fixture', 'canonical-fixture', 'Canonical target', 'active'),
               (901, 1, 'Deprecated fixture', 'deprecated fixture', 'deprecated-fixture', NULL, 'deprecated');
             INSERT INTO Tags (Id, GroupId, Name, NormalizedName, Slug, Status, MergedIntoTagId)
             VALUES (902, 1, 'Merged fixture', 'merged fixture', 'merged-fixture', 'merged', 900)`
        );

        const merged = await new TagRepositoryMysql(pool).findById(902);
        assert.equal(merged?.status, 'merged');
        assert.equal(merged?.mergedIntoTagId, 900);
        const publicTagIds = (await new TagRepositoryMysql(pool).findAll()).map(({ id }) => id);
        assert.ok(publicTagIds.includes(900));
        assert.equal(publicTagIds.includes(901), false);
        assert.equal(publicTagIds.includes(902), false);

        await connection.query(
            `UPDATE Tags
             SET Description = 'Updated canonical target'
             WHERE Id = 900`
        );
        const canonical = await new TagRepositoryMysql(pool).findById(900);
        assert.ok(canonical);
        assert.equal(canonical.description, 'Updated canonical target');
        assert.ok(canonical.updatedAt >= canonical.createdAt);

        await assert.rejects(() => connection.query(
            `INSERT INTO Tags (GroupId, Name, NormalizedName, Slug, Status)
             VALUES (1, 'Missing merge target', 'missing merge target', 'missing-merge-target', 'merged')`
        ));
        await assert.rejects(() => connection.query(
            `INSERT INTO Tags (GroupId, Name, NormalizedName, Slug, Status, MergedIntoTagId)
             VALUES (1, 'Unexpected merge target', 'unexpected merge target', 'unexpected-merge-target', 'active', 900)`
        ));
        await assert.rejects(() => connection.query(
            `INSERT INTO Tags (Id, GroupId, Name, NormalizedName, Slug, Status, MergedIntoTagId)
             VALUES (903, 1, 'Self merge', 'self merge', 'self-merge', 'merged', 903)`
        ));
        await assert.rejects(() => connection.query(
            `INSERT INTO Tags (GroupId, Name, NormalizedName, Slug, Status, MergedIntoTagId)
             VALUES (1, 'Unknown merge target', 'unknown merge target', 'unknown-merge-target', 'merged', 999999)`
        ));
        await assert.rejects(() => connection.query(
            `INSERT INTO Tags (GroupId, Name, NormalizedName, Slug, Status, MergedIntoTagId)
             VALUES (1, 'Deprecated merge target', 'deprecated merge target', 'deprecated-merge-target', 'merged', 901)`
        ));
        await assert.rejects(() => connection.query(
            `UPDATE Tags SET Status = 'deprecated' WHERE Id = 900`
        ));
        await assert.rejects(() => connection.query(
            `INSERT INTO Tags (GroupId, Name, NormalizedName, Slug)
             VALUES (1, 'Duplicate normalized name', 'CANONICAL FIXTURE', 'another-canonical-fixture')`
        ));
        await assert.rejects(() => connection.query(
            `INSERT INTO Tags (GroupId, Name, NormalizedName, Slug)
             VALUES (1, 'Uppercase normalized name', 'UPPERCASE FIXTURE', 'uppercase-fixture')`
        ));
        await assert.rejects(() => connection.query(
            `INSERT INTO Tags (GroupId, Name, NormalizedName, Slug)
             VALUES (1, 'Invalid slug', 'invalid slug', 'Invalid Slug')`
        ));
        await assert.rejects(() => connection.query(
            `INSERT INTO Tags (GroupId, Name, NormalizedName, Slug, Description)
             VALUES (1, 'Blank description', 'blank description', 'blank-description', '   ')`
        ));
        await assert.rejects(
            () => connection.query(`DELETE FROM Tags WHERE Id = 901`),
            assertTagDeletionRejected
        );
    });
});
