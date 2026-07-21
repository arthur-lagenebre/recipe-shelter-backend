import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AdminIngredientRepositoryMysql } from '../../../src/repositories/admin/admin.ingredients.repository.mysql.js';

import type { Pool, PoolConnection } from 'mysql2/promise';

describe('AdminIngredientRepositoryMysql merge', () => {
    it('transfers references, preserves the author label and creates a deduplicated source-name alias', async () => {
        const statements: Array<{ sql: string; params: unknown }> = [];
        const db = createConnection(statements, [
            [[{ Id: 30 }, { Id: 31 }], []],
            [
                [
                    { Id: 100, IngredientId: 10, NormalizedName: 'source alias', LanguageCode: 'fr' },
                    { Id: 101, IngredientId: 20, NormalizedName: 'target alias one', LanguageCode: 'fr' },
                    { Id: 102, IngredientId: 20, NormalizedName: 'target alias two', LanguageCode: 'en' }
                ],
                []
            ],
            [{ affectedRows: 1 }, []],
            [
                [
                    { Id: 1, IngredientId: 10 },
                    { Id: 2, IngredientId: 10 },
                    { Id: 3, IngredientId: 20 }
                ],
                []
            ],
            [{ affectedRows: 2 }, []],
            [{ affectedRows: 2 }, []],
            [{ affectedRows: 1 }, []],
            [{ affectedRows: 1 }, []]
        ]);
        const repository = new AdminIngredientRepositoryMysql({} as Pool);

        assert.deepEqual(await repository.merge(mergeInput(), db), {
            status: 'merged',
            sourceRecipeAssociationCountBefore: 2,
            targetRecipeAssociationCountBefore: 1,
            targetRecipeAssociationCountAfter: 3,
            transferredRecipeAssociationCount: 2,
            sourceAliasCountBefore: 1,
            targetAliasCountBefore: 2,
            targetAliasCountAfter: 4,
            transferredAliasCount: 1,
            sourceNameAliasResolution: 'created',
            redirectedMergedIngredientCount: 2
        });
        assert.equal(statements.length, 8);
        assert.match(statements[0]?.sql ?? '', /FROM Ingredients[\s\S]*MergedIntoIngredientId[\s\S]*FOR UPDATE/);
        assert.match(statements[1]?.sql ?? '', /FROM IngredientAliases[\s\S]*NormalizedName[\s\S]*FOR UPDATE/);
        assert.deepEqual(statements[2]?.params, [20, 'Source canonical', 'source canonical', 'fr']);
        assert.match(statements[3]?.sql ?? '', /FROM RecipeIngredients[\s\S]*FOR UPDATE/);
        assert.match(statements[4]?.sql ?? '', /^UPDATE RecipeIngredients/);
        assert.match(statements[4]?.sql ?? '', /SET IngredientId = \?/);
        assert.doesNotMatch(statements[4]?.sql ?? '', /DisplayText|Quantity|Unit|Note/);
        assert.deepEqual(statements[4]?.params, [20, 10]);
        assert.deepEqual(statements[5]?.params, [20, 10]);
        assert.deepEqual(statements[6]?.params, [20, 10]);
        assert.deepEqual(statements[7]?.params, [20, 10]);
    });

    it('reuses an equivalent source alias instead of creating a duplicate', async () => {
        const statements: Array<{ sql: string; params: unknown }> = [];
        const db = createConnection(statements, [
            [[], []],
            [
                [
                    { Id: 100, IngredientId: 10, NormalizedName: 'source canonical', LanguageCode: 'fr' },
                    { Id: 101, IngredientId: 20, NormalizedName: 'target alias', LanguageCode: 'fr' }
                ],
                []
            ],
            [[], []],
            [{ affectedRows: 0 }, []],
            [{ affectedRows: 0 }, []],
            [{ affectedRows: 1 }, []],
            [{ affectedRows: 1 }, []]
        ]);
        const repository = new AdminIngredientRepositoryMysql({} as Pool);

        assert.deepEqual(await repository.merge(mergeInput(), db), {
            status: 'merged',
            sourceRecipeAssociationCountBefore: 0,
            targetRecipeAssociationCountBefore: 0,
            targetRecipeAssociationCountAfter: 0,
            transferredRecipeAssociationCount: 0,
            sourceAliasCountBefore: 1,
            targetAliasCountBefore: 1,
            targetAliasCountAfter: 2,
            transferredAliasCount: 1,
            sourceNameAliasResolution: 'reused_source_alias',
            redirectedMergedIngredientCount: 0
        });
        assert.equal(statements.length, 7);
        assert.doesNotMatch(statements.map(({ sql }) => sql).join('\n'), /INSERT INTO IngredientAliases/);
    });

    it('reuses an equivalent target alias and still transfers every source alias', async () => {
        const statements: Array<{ sql: string; params: unknown }> = [];
        const db = createConnection(statements, [
            [[], []],
            [
                [
                    { Id: 100, IngredientId: 10, NormalizedName: 'source synonym', LanguageCode: 'en' },
                    { Id: 101, IngredientId: 20, NormalizedName: 'source canonical', LanguageCode: 'fr' }
                ],
                []
            ],
            [[], []],
            [{ affectedRows: 0 }, []],
            [{ affectedRows: 0 }, []],
            [{ affectedRows: 1 }, []],
            [{ affectedRows: 1 }, []]
        ]);
        const repository = new AdminIngredientRepositoryMysql({} as Pool);

        assert.deepEqual(await repository.merge(mergeInput(), db), {
            status: 'merged',
            sourceRecipeAssociationCountBefore: 0,
            targetRecipeAssociationCountBefore: 0,
            targetRecipeAssociationCountAfter: 0,
            transferredRecipeAssociationCount: 0,
            sourceAliasCountBefore: 1,
            targetAliasCountBefore: 1,
            targetAliasCountAfter: 2,
            transferredAliasCount: 1,
            sourceNameAliasResolution: 'reused_target_alias',
            redirectedMergedIngredientCount: 0
        });
        assert.doesNotMatch(statements.map(({ sql }) => sql).join('\n'), /INSERT INTO IngredientAliases/);
    });

    it('rejects a source-name alias owned by an unrelated ingredient before changing data', async () => {
        const statements: Array<{ sql: string; params: unknown }> = [];
        const db = createConnection(statements, [
            [[], []],
            [[{ Id: 100, IngredientId: 30, NormalizedName: 'source canonical', LanguageCode: 'fr' }], []]
        ]);
        const repository = new AdminIngredientRepositoryMysql({} as Pool);

        assert.deepEqual(await repository.merge(mergeInput(), db), {
            status: 'source_name_alias_conflict',
            conflictingIngredientId: 30
        });
        assert.equal(statements.length, 2);
        assert.doesNotMatch(statements.map(({ sql }) => sql).join('\n'), /^(?:UPDATE|INSERT)/m);
    });

    it('maps a concurrent source-name alias insertion to a conflict with or without a visible owner', async () => {
        for (const [ownerRows, conflictingIngredientId] of [
            [[{ IngredientId: 30 }], 30],
            [[], null]
        ] as const) {
            const statements: Array<{ sql: string; params: unknown }> = [];
            const db = createConnection(statements, [[[], []], [[], []], duplicateAliasError(), [ownerRows, []]]);
            const repository = new AdminIngredientRepositoryMysql({} as Pool);

            assert.deepEqual(await repository.merge(mergeInput(), db), {
                status: 'source_name_alias_conflict',
                conflictingIngredientId
            });
            assert.equal(statements.length, 4);
            assert.match(statements[2]?.sql ?? '', /INSERT INTO IngredientAliases/);
            assert.match(statements[3]?.sql ?? '', /LanguageCode = \? AND NormalizedName = \?[\s\S]*FOR UPDATE/);
        }
    });

    it('preserves unexpected source-name alias insertion failures', async () => {
        const statements: Array<{ sql: string; params: unknown }> = [];
        const persistenceError = new Error('ingredient alias storage unavailable');
        const db = createConnection(statements, [[[], []], [[], []], persistenceError]);
        const repository = new AdminIngredientRepositoryMysql({} as Pool);

        await assert.rejects(() => repository.merge(mergeInput(), db), persistenceError);
        assert.equal(statements.length, 3);
    });

    it('fails closed if locked recipe relationships change before transfer', async () => {
        const statements: Array<{ sql: string; params: unknown }> = [];
        const db = createConnection(statements, [
            [[], []],
            [[{ Id: 100, IngredientId: 20, NormalizedName: 'source canonical', LanguageCode: 'fr' }], []],
            [[{ Id: 1, IngredientId: 10 }], []],
            [{ affectedRows: 0 }, []]
        ]);
        const repository = new AdminIngredientRepositoryMysql({} as Pool);

        await assert.rejects(() => repository.merge(mergeInput(), db), /Ingredient recipe associations changed during merge/);
        assert.equal(statements.length, 4);
        assert.doesNotMatch(statements.map(({ sql }) => sql).join('\n'), /UPDATE IngredientAliases|SET Status = 'merged'/);
    });

    it('fails closed if historical redirects change after their rows were locked', async () => {
        const statements: Array<{ sql: string; params: unknown }> = [];
        const db = createConnection(statements, [
            [[{ Id: 30 }], []],
            [[{ Id: 100, IngredientId: 20, NormalizedName: 'source canonical', LanguageCode: 'fr' }], []],
            [[], []],
            [{ affectedRows: 0 }, []],
            [{ affectedRows: 0 }, []]
        ]);
        const repository = new AdminIngredientRepositoryMysql({} as Pool);

        await assert.rejects(() => repository.merge(mergeInput(), db), /Merged ingredient references changed during merge/);
        assert.doesNotMatch(statements.map(({ sql }) => sql).join('\n'), /UPDATE IngredientAliases|SET Status = 'merged'/);
    });

    it('fails closed if source aliases change after their rows were locked', async () => {
        const statements: Array<{ sql: string; params: unknown }> = [];
        const db = createConnection(statements, [
            [[], []],
            [[{ Id: 100, IngredientId: 10, NormalizedName: 'source canonical', LanguageCode: 'fr' }], []],
            [[], []],
            [{ affectedRows: 0 }, []],
            [{ affectedRows: 0 }, []],
            [{ affectedRows: 0 }, []]
        ]);
        const repository = new AdminIngredientRepositoryMysql({} as Pool);

        await assert.rejects(() => repository.merge(mergeInput(), db), /Ingredient aliases changed during merge/);
        assert.doesNotMatch(statements.map(({ sql }) => sql).join('\n'), /SET Status = 'merged'/);
    });

    it('reports a concurrent source-status no-op without inventing transfer counts', async () => {
        const statements: Array<{ sql: string; params: unknown }> = [];
        const db = createConnection(statements, [
            [[], []],
            [[{ Id: 100, IngredientId: 20, NormalizedName: 'source canonical', LanguageCode: 'fr' }], []],
            [[], []],
            [{ affectedRows: 0 }, []],
            [{ affectedRows: 0 }, []],
            [{ affectedRows: 0 }, []],
            [{ affectedRows: 0 }, []]
        ]);
        const repository = new AdminIngredientRepositoryMysql({} as Pool);

        assert.deepEqual(await repository.merge(mergeInput(), db), { status: 'not_merged' });
    });

    it('identifies only aliases that preserve a merged source canonical name', async () => {
        const statements: Array<{ sql: string; params: unknown }> = [];
        const db = createConnection(statements, [
            [[{ Exists: 1 }], []],
            [[], []]
        ]);
        const repository = new AdminIngredientRepositoryMysql({} as Pool);

        assert.equal(await repository.isMergeSourceNameAlias(20, 100, db), true);
        assert.equal(await repository.isMergeSourceNameAlias(20, 101, db), false);
        assert.deepEqual(
            statements.map(({ params }) => params),
            [
                [100, 20],
                [101, 20]
            ]
        );
    });
});

function mergeInput() {
    return {
        sourceIngredientId: 10,
        targetIngredientId: 20,
        sourceName: 'Source canonical',
        sourceNormalizedName: 'source canonical',
        sourceNameLanguageCode: 'fr'
    };
}

function duplicateAliasError() {
    return Object.assign(new Error('Duplicate entry for ingredient_aliases_language_normalized_name_UK'), {
        code: 'ER_DUP_ENTRY'
    });
}

function createConnection(statements: Array<{ sql: string; params: unknown }>, responses: unknown[]): PoolConnection {
    return {
        async execute(sql: string, params: unknown) {
            statements.push({ sql, params });
            const response = responses.shift();
            if (!response)
                throw new Error('Unexpected SQL statement');
            if (response instanceof Error)
                throw response;

            return response;
        }
    } as unknown as PoolConnection;
}
