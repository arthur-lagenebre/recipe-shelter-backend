import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import mysql from 'mysql2/promise';

import { AdminAuditRepositoryMysql } from '../../../src/repositories/admin/admin-audit.repository.mysql.js';
import { AdminTagRepositoryMysql } from '../../../src/repositories/admin/admin.tags.repository.mysql.js';
import { TagRepositoryMysql } from '../../../src/repositories/tag/tag.repository.mysql.js';
import { AdminAuditActionRunnerMysql } from '../../../src/services/admin/admin-audit-action.runner.js';
import { AdminAuditService } from '../../../src/services/admin/admin-audit.service.js';
import { AdminTagService } from '../../../src/services/admin/admin.tags.service.js';
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

function assertActiveNormalizedDuplicateRejected(error: unknown): boolean {
    assert.ok(error instanceof Error);

    const mysqlError = error as Error & {
        errno?: number;
        sqlMessage?: string;
    };

    assert.equal(mysqlError.errno, 1062);
    assert.match(mysqlError.sqlMessage ?? '', /tags_active_normalized_name_UK/);
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
                'tags_active_normalized_name_UK',
                'tags_slug_UK'
            ]
        );

        const [mergeIntegrityTriggers] = await connection.query(
            `SELECT TRIGGER_NAME AS TriggerName, LOWER(EVENT_OBJECT_TABLE) AS TableName,
                    ACTION_TIMING AS ActionTiming, EVENT_MANIPULATION AS EventManipulation
             FROM information_schema.TRIGGERS
             WHERE TRIGGER_SCHEMA = ?
               AND TRIGGER_NAME IN ('recipe_tags_active_tag_BI', 'tags_merged_recipe_associations_BU')
             ORDER BY TRIGGER_NAME`,
            [databaseName]
        );
        assert.deepEqual(mergeIntegrityTriggers, [
            {
                TriggerName: 'recipe_tags_active_tag_BI',
                TableName: 'recipetags',
                ActionTiming: 'BEFORE',
                EventManipulation: 'INSERT'
            },
            {
                TriggerName: 'tags_merged_recipe_associations_BU',
                TableName: 'tags',
                ActionTiming: 'BEFORE',
                EventManipulation: 'UPDATE'
            }
        ]);

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

    it('rejects equivalent active names while preserving deprecated and merged variants', async () => {
        await connection.query(
            `INSERT INTO Tags (Id, GroupId, Name, NormalizedName, Slug, Description)
             VALUES (910, 1, 'Crème brûlée', 'creme brulee', 'normalization-canonical', 'Canonical fixture')`
        );

        const activeVariants = [
            { name: 'CRÈME BRÛLÉE', slug: 'normalization-case' },
            { name: 'Creme brulee', slug: 'normalization-accents' },
            { name: 'Crème   brûlée', slug: 'normalization-spaces' },
            { name: 'Crème---brûlée!!!', slug: 'normalization-punctuation' }
        ];

        for (const { name, slug } of activeVariants) {
            await assert.rejects(
                () => connection.query(
                    `INSERT INTO Tags (GroupId, Name, NormalizedName, Slug)
                     VALUES (1, ?, 'creme brulee', ?)`,
                    [name, slug]
                ),
                assertActiveNormalizedDuplicateRejected
            );
        }

        await assert.rejects(() => connection.query(
            `INSERT INTO Tags (GroupId, Name, NormalizedName, Slug, Status)
             VALUES (1, 'Crème brûlée', 'unrelated value', 'normalization-mismatch', 'deprecated')`
        ));

        await connection.query(
            `INSERT INTO Tags (Id, GroupId, Name, NormalizedName, Slug, Status) VALUES
               (911, 1, 'Creme---brulee', 'creme brulee', 'normalization-deprecated', 'deprecated');
             INSERT INTO Tags (Id, GroupId, Name, NormalizedName, Slug, Status, MergedIntoTagId)
             VALUES (912, 1, 'CRÈME BRÛLÉE', 'creme brulee', 'normalization-merged', 'merged', 910)`
        );

        await assert.rejects(
            () => connection.query(`UPDATE Tags SET Status = 'active' WHERE Id = 911`),
            assertActiveNormalizedDuplicateRejected
        );

        const [historicalVariants] = await connection.query(
            `SELECT Id, Status, MergedIntoTagId
             FROM Tags
             WHERE Id IN (911, 912)
             ORDER BY Id`
        );
        assert.deepEqual(historicalVariants, [
            { Id: 911, Status: 'deprecated', MergedIntoTagId: null },
            { Id: 912, Status: 'merged', MergedIntoTagId: 910 }
        ]);
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
             VALUES (1, 'Mismatched normalized name', 'another value', 'mismatched-normalized-name')`
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

    it('persists paginated administration writes and merges recipe relationships without deleting tags', async () => {
        const repository = new AdminTagRepositoryMysql(pool);
        const db = await pool.getConnection();

        try {
            await db.beginTransaction();

            assert.equal(await repository.groupExists(1, db), true);
            const createdResult = await repository.create({
                groupId: 1,
                name: 'Administrative fixture',
                normalizedName: 'administrative fixture',
                slug: 'administrative-fixture',
                description: 'Created through the administrative repository'
            }, db);
            assert.equal(createdResult.status, 'written');
            if (createdResult.status !== 'written')
                throw new Error('Expected the administrative tag fixture to be created');

            assert.deepEqual(await repository.create({
                groupId: 1,
                name: 'ADMINISTRATIVE FIXTURE',
                normalizedName: 'administrative fixture',
                slug: 'administrative-fixture-copy',
                description: null
            }, db), { status: 'normalized_name_taken' });
            assert.deepEqual(await repository.create({
                groupId: 1,
                name: 'Other administrative fixture',
                normalizedName: 'other administrative fixture',
                slug: 'administrative-fixture',
                description: null
            }, db), { status: 'slug_taken' });

            const updatedResult = await repository.update({
                id: createdResult.tag.id,
                groupId: 2,
                name: 'Administrative updated fixture',
                normalizedName: 'administrative updated fixture',
                slug: 'administrative-updated-fixture',
                description: null
            }, db);
            assert.equal(updatedResult.status, 'written');
            if (updatedResult.status !== 'written')
                throw new Error('Expected the administrative tag fixture to be updated');
            assert.equal(updatedResult.tag.group.id, 2);

            const page = await repository.find(
                { status: 'active', groupId: 2, q: 'updated fixture' },
                { page: 1, limit: 1, offset: 0 },
                db
            );
            assert.equal(page.items[0]?.id, createdResult.tag.id);
            assert.equal(page.pagination.page, 1);
            assert.equal(page.pagination.limit, 1);
            assert.ok(page.pagination.totalItems >= 1);

            assert.equal(await repository.deprecate(createdResult.tag.id, db), true);
            assert.equal(await repository.restore(createdResult.tag.id, db), 'restored');

            await db.execute(
                `INSERT INTO Users (Id, Mail, Username, Password, AccountType, Status, EmailValidatedAt)
                 VALUES (930, 'tag-admin-fixture@example.test', 'tag-admin-fixture', 'test-password-hash', 'community', 'active', CURRENT_TIMESTAMP)`
            );
            await db.execute(
                `INSERT INTO Recipes (Id, UserId, CategoryId, Title, Slug, Description, PrepTimeMinutes, Servings)
                 VALUES
                   (930, 930, 1, 'Tag merge fixture one', 'tag-merge-fixture-one', 'Fixture', 5, 2),
                   (931, 930, 1, 'Tag merge fixture two', 'tag-merge-fixture-two', 'Fixture', 5, 2)`
            );
            await db.execute(
                `INSERT INTO Tags (Id, GroupId, Name, NormalizedName, Slug) VALUES
                   (930, 1, 'Merge source fixture', 'merge source fixture', 'merge-source-fixture'),
                   (931, 1, 'Merge target fixture', 'merge target fixture', 'merge-target-fixture')`
            );
            await db.execute(
                `INSERT INTO Tags (Id, GroupId, Name, NormalizedName, Slug, Status, MergedIntoTagId)
                 VALUES (932, 1, 'Previous alias fixture', 'previous alias fixture', 'previous-alias-fixture', 'merged', 930)`
            );
            await db.execute(
                `INSERT INTO RecipeTags (RecipeId, TagId) VALUES
                   (930, 930),
                   (931, 930),
                   (931, 931)`
            );

            const locked = await repository.findByIdsForUpdate([930, 931], db);
            assert.deepEqual(locked.map((tag) => tag.id), [930, 931]);
            const merged = await repository.merge(930, 931, db);
            assert.deepEqual(merged, {
                merged: true,
                sourceRecipeCountBefore: 2,
                targetRecipeCountBefore: 1,
                targetRecipeCountAfter: 2,
                transferredRecipeCount: 1,
                deduplicatedRecipeCount: 1,
                redirectedMergedTagCount: 1
            });

            const [recipeTags] = await db.query(
                `SELECT RecipeId, TagId
                 FROM RecipeTags
                 WHERE RecipeId IN (930, 931)
                 ORDER BY RecipeId, TagId`
            );
            assert.deepEqual(recipeTags, [
                { RecipeId: 930, TagId: 931 },
                { RecipeId: 931, TagId: 931 }
            ]);

            const [mergedTags] = await db.query(
                `SELECT Id, Status, MergedIntoTagId
                 FROM Tags
                 WHERE Id IN (930, 932)
                 ORDER BY Id`
            );
            assert.deepEqual(mergedTags, [
                { Id: 930, Status: 'merged', MergedIntoTagId: 931 },
                { Id: 932, Status: 'merged', MergedIntoTagId: 931 }
            ]);

            await assert.rejects(
                () => db.execute(
                    `INSERT INTO RecipeTags (RecipeId, TagId)
                     VALUES (930, 930)`
                ),
                /Recipes can only reference active canonical tags/
            );

            await db.execute(
                `INSERT INTO Tags (Id, GroupId, Name, NormalizedName, Slug)
                 VALUES (933, 1, 'Still associated fixture', 'still associated fixture', 'still-associated-fixture')`
            );
            await db.execute(
                `INSERT INTO RecipeTags (RecipeId, TagId)
                 VALUES (930, 933)`
            );
            await assert.rejects(
                () => db.execute(
                    `UPDATE Tags
                     SET Status = 'merged', MergedIntoTagId = 931
                     WHERE Id = 933`
                ),
                /A tag must have no recipe associations before being merged/
            );
        } finally {
            await db.rollback();
            db.release();
        }
    });

    it('commits the merge and its before/after audit atomically, then rolls both back on audit failure', async () => {
        await connection.query(
            `INSERT INTO Users (Id, Mail, Username, Password, AccountType, Status) VALUES
               (950, 'tag-merge-staff@example.test', 'tag-merge-staff', 'test-password-hash', 'staff', 'inactive'),
               (951, 'tag-merge-author@example.test', 'tag-merge-author', 'test-password-hash', 'community', 'active');
             INSERT INTO Recipes (Id, UserId, CategoryId, Title, Slug, Description, PrepTimeMinutes, Servings) VALUES
               (950, 951, 1, 'Transactional merge fixture one', 'transactional-merge-fixture-one', 'Fixture', 5, 2),
               (951, 951, 1, 'Transactional merge fixture two', 'transactional-merge-fixture-two', 'Fixture', 5, 2);
             INSERT INTO Tags (Id, GroupId, Name, NormalizedName, Slug) VALUES
               (950, 1, 'Transactional source fixture', 'transactional source fixture', 'transactional-source-fixture'),
               (951, 1, 'Transactional target fixture', 'transactional target fixture', 'transactional-target-fixture'),
               (953, 1, 'Rollback source fixture', 'rollback source fixture', 'rollback-source-fixture'),
               (954, 1, 'Rollback target fixture', 'rollback target fixture', 'rollback-target-fixture');
             INSERT INTO Tags (Id, GroupId, Name, NormalizedName, Slug, Status, MergedIntoTagId)
             VALUES (952, 1, 'Transactional alias fixture', 'transactional alias fixture', 'transactional-alias-fixture', 'merged', 950);
             INSERT INTO RecipeTags (RecipeId, TagId) VALUES
               (950, 950),
               (951, 950),
               (951, 951),
               (950, 953)`
        );

        const [targetBeforeRows] = await connection.query(
            `SELECT Id, GroupId, Name, NormalizedName, Slug, Description, Status, MergedIntoTagId, CreatedAt, UpdatedAt
             FROM Tags
             WHERE Id = 951`
        );
        const targetBefore = (targetBeforeRows as Array<Record<string, unknown>>)[0];
        const repository = new AdminTagRepositoryMysql(pool);
        const auditActions = new AdminAuditActionRunnerMysql(
            pool,
            (db) => new AdminAuditService(new AdminAuditRepositoryMysql(db))
        );
        const service = new AdminTagService(repository, auditActions);
        const correlationId = '00000000-0000-4000-8000-000000000950';

        const merged = await service.merge(950, {
            targetTagId: 951,
            reason: 'Doublon confirmé par le test transactionnel.'
        }, 950, { correlationId });

        assert.equal(merged.status, 'merged');
        assert.equal(merged.mergedIntoTagId, 951);
        const [targetAfterRows] = await connection.query(
            `SELECT Id, GroupId, Name, NormalizedName, Slug, Description, Status, MergedIntoTagId, CreatedAt, UpdatedAt
             FROM Tags
             WHERE Id = 951`
        );
        assert.deepEqual((targetAfterRows as Array<Record<string, unknown>>)[0], targetBefore);

        const [committedRecipeTags] = await connection.query(
            `SELECT RecipeId, TagId
             FROM RecipeTags
             WHERE RecipeId IN (950, 951) AND TagId IN (950, 951)
             ORDER BY RecipeId, TagId`
        );
        assert.deepEqual(committedRecipeTags, [
            { RecipeId: 950, TagId: 951 },
            { RecipeId: 951, TagId: 951 }
        ]);

        const [committedTags] = await connection.query(
            `SELECT Id, Status, MergedIntoTagId
             FROM Tags
             WHERE Id IN (950, 951, 952)
             ORDER BY Id`
        );
        assert.deepEqual(committedTags, [
            { Id: 950, Status: 'merged', MergedIntoTagId: 951 },
            { Id: 951, Status: 'active', MergedIntoTagId: null },
            { Id: 952, Status: 'merged', MergedIntoTagId: 951 }
        ]);

        const [auditRows] = await connection.query(
            `SELECT Action, TargetType, TargetId, Reason,
                    JSON_UNQUOTE(JSON_EXTRACT(BeforeValues, '$.source.status')) AS BeforeSourceStatus,
                    CAST(JSON_UNQUOTE(JSON_EXTRACT(BeforeValues, '$.recipeAssociations.sourceCount')) AS UNSIGNED) AS BeforeSourceRecipeCount,
                    CAST(JSON_UNQUOTE(JSON_EXTRACT(BeforeValues, '$.recipeAssociations.targetCount')) AS UNSIGNED) AS BeforeTargetRecipeCount,
                    CAST(JSON_UNQUOTE(JSON_EXTRACT(BeforeValues, '$.recipeAssociations.sharedCount')) AS UNSIGNED) AS BeforeSharedRecipeCount,
                    JSON_UNQUOTE(JSON_EXTRACT(AfterValues, '$.source.status')) AS AfterSourceStatus,
                    CAST(JSON_UNQUOTE(JSON_EXTRACT(AfterValues, '$.recipeAssociations.sourceCount')) AS UNSIGNED) AS AfterSourceRecipeCount,
                    CAST(JSON_UNQUOTE(JSON_EXTRACT(AfterValues, '$.recipeAssociations.targetCount')) AS UNSIGNED) AS AfterTargetRecipeCount,
                    CAST(JSON_UNQUOTE(JSON_EXTRACT(AfterValues, '$.transfer.transferredRecipeCount')) AS UNSIGNED) AS TransferredRecipeCount,
                    CAST(JSON_UNQUOTE(JSON_EXTRACT(AfterValues, '$.transfer.deduplicatedRecipeCount')) AS UNSIGNED) AS DeduplicatedRecipeCount,
                    CAST(JSON_UNQUOTE(JSON_EXTRACT(AfterValues, '$.transfer.redirectedMergedTagCount')) AS UNSIGNED) AS RedirectedMergedTagCount
             FROM AdminAuditLogs
             WHERE CorrelationId = ?`,
            [correlationId]
        );
        assert.deepEqual(auditRows, [{
            Action: 'tags.merge',
            TargetType: 'tag',
            TargetId: '950',
            Reason: 'Doublon confirmé par le test transactionnel.',
            BeforeSourceStatus: 'active',
            BeforeSourceRecipeCount: 2,
            BeforeTargetRecipeCount: 1,
            BeforeSharedRecipeCount: 1,
            AfterSourceStatus: 'merged',
            AfterSourceRecipeCount: 0,
            AfterTargetRecipeCount: 2,
            TransferredRecipeCount: 1,
            DeduplicatedRecipeCount: 1,
            RedirectedMergedTagCount: 1
        }]);

        const failedCorrelationId = '00000000-0000-4000-8000-000000000951';
        const failingService = new AdminTagService(
            repository,
            new AdminAuditActionRunnerMysql(pool, () => ({
                async record() {
                    throw new Error('forced tag merge audit failure');
                }
            }))
        );
        await assert.rejects(
            () => failingService.merge(953, {
                targetTagId: 954,
                reason: 'Cette fusion doit être entièrement annulée.'
            }, 950, { correlationId: failedCorrelationId }),
            /forced tag merge audit failure/
        );

        const [rolledBack] = await connection.query(
            `SELECT source.Status AS SourceStatus, source.MergedIntoTagId,
                    (SELECT COUNT(*) FROM RecipeTags WHERE TagId = 953) AS SourceRecipeCount,
                    (SELECT COUNT(*) FROM RecipeTags WHERE TagId = 954) AS TargetRecipeCount,
                    (SELECT COUNT(*) FROM AdminAuditLogs WHERE CorrelationId = ?) AS AuditCount
             FROM Tags AS source
             WHERE source.Id = 953`,
            [failedCorrelationId]
        );
        assert.deepEqual(rolledBack, [{
            SourceStatus: 'active',
            MergedIntoTagId: null,
            SourceRecipeCount: 1,
            TargetRecipeCount: 0,
            AuditCount: 0
        }]);
    });

    it('serializes a concurrent recipe association so it cannot recreate a merged source link', async () => {
        await connection.query(
            `INSERT INTO Tags (Id, GroupId, Name, NormalizedName, Slug) VALUES
               (960, 1, 'Concurrent source fixture', 'concurrent source fixture', 'concurrent-source-fixture'),
               (961, 1, 'Concurrent target fixture', 'concurrent target fixture', 'concurrent-target-fixture')`
        );
        const mergeDb = await pool.getConnection();
        const recipeDb = await pool.getConnection();

        try {
            await mergeDb.beginTransaction();
            await recipeDb.beginTransaction();
            const repository = new AdminTagRepositoryMysql(pool);
            await repository.findByIdsForUpdate([960, 961], mergeDb);

            const pendingAssociation = recipeDb.execute(
                `INSERT INTO RecipeTags (RecipeId, TagId)
                 VALUES (950, 960)`
            ).then(
                () => null,
                (error: unknown) => error
            );

            const result = await repository.merge(960, 961, mergeDb);
            assert.equal(result.merged, true);
            await mergeDb.commit();

            const associationError = await pendingAssociation;
            assert.ok(associationError instanceof Error);
            assert.match(
                (associationError as Error & { sqlMessage?: string }).sqlMessage ?? associationError.message,
                /Recipes can only reference active canonical tags/
            );
            await recipeDb.rollback();

            const [persistedState] = await connection.query(
                `SELECT source.Status AS SourceStatus, source.MergedIntoTagId,
                        (SELECT COUNT(*) FROM RecipeTags WHERE TagId = 960) AS SourceRecipeCount,
                        (SELECT COUNT(*) FROM RecipeTags WHERE TagId = 961) AS TargetRecipeCount
                 FROM Tags AS source
                 WHERE source.Id = 960`
            );
            assert.deepEqual(persistedState, [{
                SourceStatus: 'merged',
                MergedIntoTagId: 961,
                SourceRecipeCount: 0,
                TargetRecipeCount: 0
            }]);
        } finally {
            await mergeDb.rollback();
            await recipeDb.rollback();
            mergeDb.release();
            recipeDb.release();
        }
    });
});
