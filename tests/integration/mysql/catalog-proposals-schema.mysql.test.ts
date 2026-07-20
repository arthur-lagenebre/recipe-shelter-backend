import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import mysql from 'mysql2/promise';

import { CatalogProposalRepositoryMysql } from '../../../src/repositories/catalog/catalog-proposals.repository.mysql.js';
import { CatalogProposalService } from '../../../src/services/catalog/catalog-proposals.service.js';
import { env } from '../../../src/utils/env.js';
import { HttpError } from '../../../src/utils/errors.js';

import type { Pool } from 'mysql2/promise';

const baseTestDatabaseName = process.env.TEST_DB_NAME?.trim() ?? '';
const mysqlEnabled = Boolean(baseTestDatabaseName);

const authorUserId = 8_600;
const otherAuthorUserId = 8_601;
const reviewerUserId = 8_602;
const authorRecipeId = 8_600;
const otherAuthorRecipeId = 8_601;
const activeTagId = 8_600;
const deprecatedTagId = 8_601;
const activeIngredientId = 8_600;
const deprecatedIngredientId = 8_601;

function requireCatalogProposalsTestDatabaseName(): string {
  if (!/^[a-zA-Z0-9_]+$/.test(baseTestDatabaseName))
    throw new Error('TEST_DB_NAME must contain only letters, numbers and underscores');
  if (!baseTestDatabaseName.toLowerCase().includes('test'))
    throw new Error('TEST_DB_NAME must contain "test"');
  if (baseTestDatabaseName === env.db.name)
    throw new Error('TEST_DB_NAME must be different from DB_NAME');

  const databaseName = `${baseTestDatabaseName}_catalog_proposals`;
  if (databaseName.length > 64)
    throw new Error('TEST_DB_NAME is too long for the catalog proposals integration database suffix');
  return databaseName;
}

function targetDatabase(sql: string, databaseName: string): string {
  return sql.replace(/USE\s+recipe_shelter\s*;/i, `USE \`${databaseName}\`;`);
}

function assertMysqlSignal(message: string): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    assert.ok(error instanceof Error);

    const mysqlError = error as Error & {
      errno?: number;
      sqlMessage?: string;
      sqlState?: string;
    };

    assert.equal(mysqlError.errno, 1644);
    assert.equal(mysqlError.sqlState, '45000');
    assert.equal(mysqlError.sqlMessage, message);
    return true;
  };
}

describe('catalog proposals schema MySQL integration', { skip: !mysqlEnabled && 'Set TEST_DB_NAME to run isolated MySQL tests' }, () => {
  let connection: mysql.Connection;
  let seed: string;

  before(async () => {
    const databaseName = requireCatalogProposalsTestDatabaseName();
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
    await connection.query(
      `INSERT INTO Users (Id, Mail, Username, Password, AccountType, Status) VALUES
         (?, 'proposal-author@test.local', 'Proposal Author', 'non-secret-test-hash', 'community', 'active'),
         (?, 'proposal-other@test.local', 'Proposal Other', 'non-secret-test-hash', 'community', 'active'),
         (?, 'proposal-reviewer@test.local', 'Proposal Reviewer', 'non-secret-test-hash', 'staff', 'inactive');
       INSERT INTO Recipes
         (Id, UserId, Title, Slug, Description, PrepTimeMinutes, Servings)
       VALUES
         (?, ?, 'Catalog proposal recipe', 'catalog-proposal-recipe', 'Recipe used to verify proposal isolation.', 10, 2),
         (?, ?, 'Other catalog proposal recipe', 'other-catalog-proposal-recipe', 'Recipe owned by another author.', 15, 4);
       INSERT INTO TagGroups (Id, Name, Slug, SortOrder)
       VALUES (8600, 'Catalog proposal fixtures', 'catalog-proposal-fixtures', 99);
       INSERT INTO Tags (Id, GroupId, Name, NormalizedName, Slug, Status) VALUES
         (?, 8600, 'Existing proposal tag', 'existing proposal tag', 'existing-proposal-tag', 'active'),
         (?, 8600, 'Deprecated proposal tag', 'deprecated proposal tag', 'deprecated-proposal-tag', 'deprecated');
       INSERT INTO Ingredients (Id, Name, NormalizedName, Slug, Status) VALUES
         (?, 'Accepted proposal ingredient', 'accepted proposal ingredient', 'accepted-proposal-ingredient', 'active'),
         (?, 'Deprecated proposal ingredient', 'deprecated proposal ingredient', 'deprecated-proposal-ingredient', 'deprecated')`,
      [
        authorUserId,
        otherAuthorUserId,
        reviewerUserId,
        authorRecipeId,
        authorUserId,
        otherAuthorRecipeId,
        otherAuthorUserId,
        activeTagId,
        deprecatedTagId,
        activeIngredientId,
        deprecatedIngredientId
      ]
    );
  });

  after(async () => {
    if (connection) {
      await connection.query(`DROP DATABASE IF EXISTS \`${requireCatalogProposalsTestDatabaseName()}\``);
      await connection.end();
    }
  });

  it('builds the final model from an empty database then applies the central seed', async () => {
    const databaseName = requireCatalogProposalsTestDatabaseName();
    const [columns] = await connection.query(
      `SELECT COLUMN_NAME AS ColumnName, COLUMN_TYPE AS ColumnType,
              IS_NULLABLE AS IsNullable, COLUMN_DEFAULT AS ColumnDefault
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'CatalogProposals'
       ORDER BY ORDINAL_POSITION`,
      [databaseName]
    );

    assert.deepEqual(columns, [
      { ColumnName: 'Id', ColumnType: 'bigint unsigned', IsNullable: 'NO', ColumnDefault: null },
      { ColumnName: 'AuthorUserId', ColumnType: 'bigint unsigned', IsNullable: 'NO', ColumnDefault: null },
      { ColumnName: 'RecipeId', ColumnType: 'bigint unsigned', IsNullable: 'NO', ColumnDefault: null },
      { ColumnName: 'ProposalType', ColumnType: "enum('tag','ingredient')", IsNullable: 'NO', ColumnDefault: null },
      { ColumnName: 'ProposedName', ColumnType: 'varchar(255)', IsNullable: 'NO', ColumnDefault: null },
      { ColumnName: 'NormalizedName', ColumnType: 'varchar(255)', IsNullable: 'NO', ColumnDefault: null },
      { ColumnName: 'Status', ColumnType: "enum('pending','accepted','rejected','merged')", IsNullable: 'NO', ColumnDefault: 'pending' },
      { ColumnName: 'MatchedTagId', ColumnType: 'bigint unsigned', IsNullable: 'YES', ColumnDefault: null },
      { ColumnName: 'MatchedIngredientId', ColumnType: 'bigint unsigned', IsNullable: 'YES', ColumnDefault: null },
      { ColumnName: 'ReviewedByStaffUserId', ColumnType: 'bigint unsigned', IsNullable: 'YES', ColumnDefault: null },
      { ColumnName: 'ReviewReason', ColumnType: 'text', IsNullable: 'YES', ColumnDefault: null },
      { ColumnName: 'CreatedAt', ColumnType: 'datetime(6)', IsNullable: 'NO', ColumnDefault: 'CURRENT_TIMESTAMP(6)' },
      { ColumnName: 'ReviewedAt', ColumnType: 'datetime(6)', IsNullable: 'YES', ColumnDefault: null }
    ]);

    const [foreignKeys] = await connection.query(
      `SELECT CONSTRAINT_NAME AS ConstraintName,
              GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION SEPARATOR ',') AS ColumnNames,
              LOWER(REFERENCED_TABLE_NAME) AS ReferencedTableName,
              GROUP_CONCAT(REFERENCED_COLUMN_NAME ORDER BY ORDINAL_POSITION SEPARATOR ',') AS ReferencedColumnNames
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE CONSTRAINT_SCHEMA = ?
         AND TABLE_NAME = 'CatalogProposals'
         AND REFERENCED_TABLE_NAME IS NOT NULL
       GROUP BY CONSTRAINT_NAME, REFERENCED_TABLE_NAME
       ORDER BY CONSTRAINT_NAME`,
      [databaseName]
    );
    assert.deepEqual(foreignKeys, [
      {
        ConstraintName: 'catalog_proposals_author_FK',
        ColumnNames: 'AuthorUserId',
        ReferencedTableName: 'communityprofiles',
        ReferencedColumnNames: 'UserId'
      },
      {
        ConstraintName: 'catalog_proposals_matched_ingredient_FK',
        ColumnNames: 'MatchedIngredientId',
        ReferencedTableName: 'ingredients',
        ReferencedColumnNames: 'Id'
      },
      {
        ConstraintName: 'catalog_proposals_matched_tag_FK',
        ColumnNames: 'MatchedTagId',
        ReferencedTableName: 'tags',
        ReferencedColumnNames: 'Id'
      },
      {
        ConstraintName: 'catalog_proposals_recipe_author_FK',
        ColumnNames: 'RecipeId,AuthorUserId',
        ReferencedTableName: 'recipes',
        ReferencedColumnNames: 'Id,UserId'
      },
      {
        ConstraintName: 'catalog_proposals_reviewer_FK',
        ColumnNames: 'ReviewedByStaffUserId',
        ReferencedTableName: 'staffprofiles',
        ReferencedColumnNames: 'UserId'
      }
    ]);

    const [seededProposals] = await connection.query('SELECT COUNT(*) AS ProposalCount FROM CatalogProposals');
    assert.deepEqual(seededProposals, [{ ProposalCount: 0 }]);
    await connection.query(seed);
    const [afterSecondSeed] = await connection.query('SELECT COUNT(*) AS ProposalCount FROM CatalogProposals');
    assert.deepEqual(afterSecondSeed, seededProposals);
  });

  it('creates community proposals through the service and MySQL repository with duplicate validation', async () => {
    const service = new CatalogProposalService(
      new CatalogProposalRepositoryMysql(connection as unknown as Pool)
    );
    const created = await service.createTagProposal({
      authorUserId,
      recipeId: authorRecipeId,
      name: '  API---catalogue suggestion  '
    });

    assert.deepEqual({
      authorUserId: created.authorUserId,
      recipeId: created.recipeId,
      proposalType: created.proposalType,
      proposedName: created.proposedName,
      normalizedName: created.normalizedName,
      status: created.status
    }, {
      authorUserId,
      recipeId: authorRecipeId,
      proposalType: 'tag',
      proposedName: 'API---catalogue suggestion',
      normalizedName: 'api catalogue suggestion',
      status: 'pending'
    });
    assert.ok(created.createdAt instanceof Date);

    await assert.rejects(
      () => service.createTagProposal({
        authorUserId,
        recipeId: authorRecipeId,
        name: 'api catalogue SUGGESTION!!!'
      }),
      (error: unknown) => assertHttpConflict(error, 'CATALOG_PROPOSALS_ALREADY_PENDING')
    );
    await assert.rejects(
      () => service.createTagProposal({
        authorUserId,
        recipeId: authorRecipeId,
        name: 'Existing proposal tag'
      }),
      (error: unknown) => assertHttpConflict(error, 'CATALOG_PROPOSALS_CANONICAL_NAME_EXISTS')
    );

    await connection.execute(
      `INSERT INTO IngredientAliases (IngredientId, Name, NormalizedName, LanguageCode)
       VALUES (?, 'Moon dust', 'moon dust', 'en')`,
      [activeIngredientId]
    );
    await assert.rejects(
      () => service.createIngredientProposal({
        authorUserId,
        recipeId: authorRecipeId,
        name: 'MOON---DUST!!!'
      }),
      (error: unknown) => assertHttpConflict(error, 'CATALOG_PROPOSALS_CANONICAL_NAME_EXISTS')
    );

    const [canonicalMutations] = await connection.query(
      `SELECT
         (SELECT COUNT(*) FROM Tags WHERE NormalizedName = 'api catalogue suggestion') AS TagCount,
         (SELECT COUNT(*) FROM Ingredients WHERE NormalizedName = 'moon dust') AS IngredientCount`
    );
    assert.deepEqual(canonicalMutations, [{ TagCount: 0, IngredientCount: 0 }]);
  });

  it('supports every lifecycle outcome without changing or blocking the recipe lifecycle', async () => {
    const [mergedInsert] = await connection.execute<mysql.ResultSetHeader>(
      `INSERT INTO CatalogProposals
         (AuthorUserId, RecipeId, ProposalType, ProposedName, NormalizedName)
       VALUES (?, ?, 'tag', 'Cuisine solaire', 'cuisine solaire')`,
      [authorUserId, authorRecipeId]
    );
    const [acceptedInsert] = await connection.execute<mysql.ResultSetHeader>(
      `INSERT INTO CatalogProposals
         (AuthorUserId, RecipeId, ProposalType, ProposedName, NormalizedName)
       VALUES (?, ?, 'ingredient', 'Poudre de lune', 'poudre de lune')`,
      [authorUserId, authorRecipeId]
    );
    const [rejectedInsert] = await connection.execute<mysql.ResultSetHeader>(
      `INSERT INTO CatalogProposals
         (AuthorUserId, RecipeId, ProposalType, ProposedName, NormalizedName)
       VALUES (?, ?, 'tag', 'Style impossible', 'style impossible')`,
      [authorUserId, authorRecipeId]
    );
    const [pendingInsert] = await connection.execute<mysql.ResultSetHeader>(
      `INSERT INTO CatalogProposals
         (AuthorUserId, RecipeId, ProposalType, ProposedName, NormalizedName)
       VALUES (?, ?, 'ingredient', 'Nuage d''épices', 'nuage d epices')`,
      [authorUserId, authorRecipeId]
    );

    await connection.execute(
      `UPDATE CatalogProposals
       SET Status = 'merged', MatchedTagId = ?, ReviewedByStaffUserId = ?,
           ReviewReason = 'This suggestion matches the existing canonical tag.',
           ReviewedAt = CURRENT_TIMESTAMP(6)
       WHERE Id = ?`,
      [activeTagId, reviewerUserId, mergedInsert.insertId]
    );
    await connection.execute(
      `UPDATE CatalogProposals
       SET Status = 'accepted', MatchedIngredientId = ?, ReviewedByStaffUserId = ?,
           ReviewReason = 'This ingredient is accepted into the canonical catalogue.',
           ReviewedAt = CURRENT_TIMESTAMP(6)
       WHERE Id = ?`,
      [activeIngredientId, reviewerUserId, acceptedInsert.insertId]
    );
    await connection.execute(
      `UPDATE CatalogProposals
       SET Status = 'rejected', ReviewedByStaffUserId = ?,
           ReviewReason = 'This suggestion is not suitable for the shared catalogue.',
           ReviewedAt = CURRENT_TIMESTAMP(6)
       WHERE Id = ?`,
      [reviewerUserId, rejectedInsert.insertId]
    );

    await connection.execute(
      `UPDATE Recipes
       SET Status = 'pending', SubmittedAt = CURRENT_TIMESTAMP
       WHERE Id = ?`,
      [authorRecipeId]
    );

    const [proposals] = await connection.query(
      `SELECT ProposalType, Status, MatchedTagId, MatchedIngredientId,
              ReviewedByStaffUserId, ReviewReason IS NOT NULL AS HasReviewReason,
              ReviewedAt IS NOT NULL AS HasReviewedAt
       FROM CatalogProposals
       WHERE Id IN (?, ?, ?, ?)
       ORDER BY Id`,
      [mergedInsert.insertId, acceptedInsert.insertId, rejectedInsert.insertId, pendingInsert.insertId]
    );
    assert.deepEqual(proposals, [
      {
        ProposalType: 'tag',
        Status: 'merged',
        MatchedTagId: activeTagId,
        MatchedIngredientId: null,
        ReviewedByStaffUserId: reviewerUserId,
        HasReviewReason: 1,
        HasReviewedAt: 1
      },
      {
        ProposalType: 'ingredient',
        Status: 'accepted',
        MatchedTagId: null,
        MatchedIngredientId: activeIngredientId,
        ReviewedByStaffUserId: reviewerUserId,
        HasReviewReason: 1,
        HasReviewedAt: 1
      },
      {
        ProposalType: 'tag',
        Status: 'rejected',
        MatchedTagId: null,
        MatchedIngredientId: null,
        ReviewedByStaffUserId: reviewerUserId,
        HasReviewReason: 1,
        HasReviewedAt: 1
      },
      {
        ProposalType: 'ingredient',
        Status: 'pending',
        MatchedTagId: null,
        MatchedIngredientId: null,
        ReviewedByStaffUserId: null,
        HasReviewReason: 0,
        HasReviewedAt: 0
      }
    ]);

    const [recipe] = await connection.query('SELECT Status FROM Recipes WHERE Id = ?', [authorRecipeId]);
    assert.deepEqual(recipe, [{ Status: 'pending' }]);
  });

  it('rejects invalid identities, duplicate pending suggestions and mismatched recipe authors', async () => {
    const invalidNames = [
      { proposedName: '   ', normalizedName: 'blank proposal' },
      { proposedName: 'Mismatched proposal', normalizedName: 'another value' },
      { proposedName: 'Uppercase proposal', normalizedName: 'Uppercase proposal' }
    ];

    for (const { proposedName, normalizedName } of invalidNames) {
      await assert.rejects(() => connection.execute(
        `INSERT INTO CatalogProposals
           (AuthorUserId, RecipeId, ProposalType, ProposedName, NormalizedName)
         VALUES (?, ?, 'tag', ?, ?)`,
        [authorUserId, authorRecipeId, proposedName, normalizedName]
      ));
    }

    await connection.execute(
      `INSERT INTO CatalogProposals
         (AuthorUserId, RecipeId, ProposalType, ProposedName, NormalizedName)
       VALUES (?, ?, 'tag', 'Doublon proposé', 'doublon propose')`,
      [authorUserId, authorRecipeId]
    );
    await assert.rejects(() => connection.execute(
      `INSERT INTO CatalogProposals
         (AuthorUserId, RecipeId, ProposalType, ProposedName, NormalizedName)
       VALUES (?, ?, 'tag', 'DOUBLON---PROPOSÉ!!!', 'doublon propose')`,
      [authorUserId, authorRecipeId]
    ));
    await assert.rejects(() => connection.execute(
      `INSERT INTO CatalogProposals
         (AuthorUserId, RecipeId, ProposalType, ProposedName, NormalizedName)
       VALUES (?, ?, 'ingredient', 'Mauvais auteur', 'mauvais auteur')`,
      [authorUserId, otherAuthorRecipeId]
    ));
    await assert.rejects(() => connection.execute(
      `INSERT INTO CatalogProposals
         (AuthorUserId, RecipeId, ProposalType, ProposedName, NormalizedName)
       VALUES (999999, ?, 'ingredient', 'Auteur inconnu', 'auteur inconnu')`,
      [authorRecipeId]
    ));
  });

  it('requires coherent staff reviews and active type-safe canonical matches', async () => {
    const createProposal = async (proposalType: 'tag' | 'ingredient', name: string): Promise<number> => {
      const normalizedName = name.toLowerCase();
      const [result] = await connection.execute<mysql.ResultSetHeader>(
        `INSERT INTO CatalogProposals
           (AuthorUserId, RecipeId, ProposalType, ProposedName, NormalizedName)
         VALUES (?, ?, ?, ?, ?)`,
        [authorUserId, authorRecipeId, proposalType, name, normalizedName]
      );
      return result.insertId;
    };

    const directFinalId = await createProposal('tag', 'Direct final fixture');
    await assert.rejects(() => connection.execute(
      `INSERT INTO CatalogProposals
         (AuthorUserId, RecipeId, ProposalType, ProposedName, NormalizedName, Status,
          ReviewedByStaffUserId, ReviewReason, ReviewedAt)
       VALUES (?, ?, 'tag', 'Direct final insert', 'direct final insert', 'rejected',
               ?, 'A final proposal cannot bypass the pending review state.', CURRENT_TIMESTAMP(6))`,
      [authorUserId, authorRecipeId, reviewerUserId]
    ), assertMysqlSignal('Catalog proposals must be created with pending status'));

    await assert.rejects(() => connection.execute(
      `UPDATE CatalogProposals
       SET Status = 'rejected', ReviewedByStaffUserId = ?, ReviewedAt = CURRENT_TIMESTAMP(6)
       WHERE Id = ?`,
      [reviewerUserId, directFinalId]
    ));

    const deprecatedTagProposalId = await createProposal('tag', 'Deprecated tag match');
    await assert.rejects(() => connection.execute(
      `UPDATE CatalogProposals
       SET Status = 'merged', MatchedTagId = ?, ReviewedByStaffUserId = ?,
           ReviewReason = 'A deprecated catalogue target must not resolve a proposal.',
           ReviewedAt = CURRENT_TIMESTAMP(6)
       WHERE Id = ?`,
      [deprecatedTagId, reviewerUserId, deprecatedTagProposalId]
    ), assertMysqlSignal('A reviewed tag proposal must match an active canonical tag'));

    const deprecatedIngredientProposalId = await createProposal('ingredient', 'Deprecated ingredient match');
    await assert.rejects(() => connection.execute(
      `UPDATE CatalogProposals
       SET Status = 'accepted', MatchedIngredientId = ?, ReviewedByStaffUserId = ?,
           ReviewReason = 'A deprecated catalogue target must not resolve a proposal.',
           ReviewedAt = CURRENT_TIMESTAMP(6)
       WHERE Id = ?`,
      [deprecatedIngredientId, reviewerUserId, deprecatedIngredientProposalId]
    ), assertMysqlSignal('A reviewed ingredient proposal must match an active canonical ingredient'));

    const wrongTargetProposalId = await createProposal('tag', 'Wrong target type');
    await assert.rejects(() => connection.execute(
      `UPDATE CatalogProposals
       SET Status = 'accepted', MatchedIngredientId = ?, ReviewedByStaffUserId = ?,
           ReviewReason = 'A tag proposal cannot resolve to an ingredient target.',
           ReviewedAt = CURRENT_TIMESTAMP(6)
       WHERE Id = ?`,
      [activeIngredientId, reviewerUserId, wrongTargetProposalId]
    ));

    const unknownReviewerProposalId = await createProposal('tag', 'Unknown reviewer');
    await assert.rejects(() => connection.execute(
      `UPDATE CatalogProposals
       SET Status = 'rejected', ReviewedByStaffUserId = 999999,
           ReviewReason = 'Every final decision must reference a real staff reviewer.',
           ReviewedAt = CURRENT_TIMESTAMP(6)
       WHERE Id = ?`,
      [unknownReviewerProposalId]
    ));
  });

  it('preserves the complete proposal identity and terminal review history', async () => {
    const [result] = await connection.execute<mysql.ResultSetHeader>(
      `INSERT INTO CatalogProposals
         (AuthorUserId, RecipeId, ProposalType, ProposedName, NormalizedName)
       VALUES (?, ?, 'ingredient', 'Historical proposal', 'historical proposal')`,
      [authorUserId, authorRecipeId]
    );

    await assert.rejects(() => connection.execute(
      `UPDATE CatalogProposals
       SET ProposedName = 'Changed historical proposal', NormalizedName = 'changed historical proposal'
       WHERE Id = ?`,
      [result.insertId]
    ), assertMysqlSignal('Catalog proposal identity is immutable'));

    await connection.execute(
      `UPDATE CatalogProposals
       SET Status = 'rejected', ReviewedByStaffUserId = ?,
           ReviewReason = 'The proposal is rejected while its original identity is retained.',
           ReviewedAt = CURRENT_TIMESTAMP(6)
       WHERE Id = ?`,
      [reviewerUserId, result.insertId]
    );

    await assert.rejects(() => connection.execute(
      `UPDATE CatalogProposals SET Status = 'pending' WHERE Id = ?`,
      [result.insertId]
    ), assertMysqlSignal('Reviewed catalog proposals are immutable'));
    await assert.rejects(() => connection.execute(
      `DELETE FROM CatalogProposals WHERE Id = ?`,
      [result.insertId]
    ), assertMysqlSignal('Catalog proposals are historical records and cannot be physically deleted'));

    const [history] = await connection.query(
      `SELECT ProposedName, NormalizedName, Status, ReviewedByStaffUserId,
              ReviewReason, CreatedAt, ReviewedAt
       FROM CatalogProposals
       WHERE Id = ?`,
      [result.insertId]
    );
    const proposal = (history as Array<Record<string, unknown>>)[0];
    assert.deepEqual(proposal && {
      proposedName: proposal.ProposedName,
      normalizedName: proposal.NormalizedName,
      status: proposal.Status,
      reviewedByStaffUserId: proposal.ReviewedByStaffUserId,
      reviewReason: proposal.ReviewReason
    }, {
      proposedName: 'Historical proposal',
      normalizedName: 'historical proposal',
      status: 'rejected',
      reviewedByStaffUserId: reviewerUserId,
      reviewReason: 'The proposal is rejected while its original identity is retained.'
    });
    assert.ok(proposal?.CreatedAt instanceof Date);
    assert.ok(proposal?.ReviewedAt instanceof Date);
  });
});

function assertHttpConflict(error: unknown, code: string): boolean {
  assert.ok(error instanceof HttpError);
  assert.equal(error.statusCode, 409);
  assert.equal(error.code, code);
  return true;
}
