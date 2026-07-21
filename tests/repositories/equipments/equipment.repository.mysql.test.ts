import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EquipmentRepositoryMysql } from '../../../src/repositories/equipments/equipment.repository.mysql.js';

import type { Pool, PoolConnection } from 'mysql2/promise';

const equipmentRow = {
    Id: 42,
    Name: 'Chinois',
    NormalizedName: 'chinois',
    Slug: 'chinois'
};

describe('EquipmentRepositoryMysql read operations', () => {
    it('maps findAll and findById results, including the not-found case', async () => {
        const statements: Array<{ sql: string; params: unknown }> = [];
        const pool = createConnection(statements, [
            [[equipmentRow], []],
            [[equipmentRow], []],
            [[], []]
        ]);
        const repository = new EquipmentRepositoryMysql(pool as unknown as Pool);

        assert.deepEqual(await repository.findAll(), [{ id: 42, name: 'Chinois', normalizedName: 'chinois', slug: 'chinois' }]);
        assert.deepEqual(await repository.findById(42), { id: 42, name: 'Chinois', normalizedName: 'chinois', slug: 'chinois' });
        assert.equal(await repository.findById(99), null);
    });

    it('returns all rows for backfill without loading normalized names', async () => {
        const statements: Array<{ sql: string; params: unknown }> = [];
        const pool = createConnection(statements, [
            [
                [
                    { Id: 1, Name: 'Fouet' },
                    { Id: 2, Name: 'Louche' }
                ],
                []
            ]
        ]);
        const repository = new EquipmentRepositoryMysql(pool as unknown as Pool);

        assert.deepEqual(await repository.findAllForBackfill(), [
            { id: 1, name: 'Fouet' },
            { id: 2, name: 'Louche' }
        ]);
        assert.match(statements[0]?.sql ?? '', /SELECT Id, Name\s+FROM Equipments/);
    });
});

describe('EquipmentRepositoryMysql findByIdsForUpdate', () => {
    it('short-circuits an empty id list and locks matching rows otherwise', async () => {
        const statements: Array<{ sql: string; params: unknown }> = [];
        const db = createConnection(statements, [[[equipmentRow], []]]);
        const repository = new EquipmentRepositoryMysql({} as Pool);

        assert.deepEqual(await repository.findByIdsForUpdate([], db), []);
        assert.equal(statements.length, 0);

        assert.deepEqual(await repository.findByIdsForUpdate([42], db), [
            { id: 42, name: 'Chinois', normalizedName: 'chinois', slug: 'chinois' }
        ]);
        assert.match(statements[0]?.sql ?? '', /FOR UPDATE/);
        assert.deepEqual(statements[0]?.params, [42]);
    });
});

describe('EquipmentRepositoryMysql create', () => {
    it('creates and reloads the written equipment, failing closed when the reload is empty', async () => {
        const repository = new EquipmentRepositoryMysql({} as Pool);
        const input = { name: 'Chinois', normalizedName: 'chinois', slug: 'chinois' };

        const createDb = createConnection(
            [],
            [
                [{ insertId: 42, affectedRows: 1 }, []],
                [[equipmentRow], []]
            ]
        );
        const created = await repository.create(input, createDb);
        assert.deepEqual(created, {
            status: 'written',
            equipment: { id: 42, name: 'Chinois', normalizedName: 'chinois', slug: 'chinois' }
        });

        const missingReloadDb = createConnection(
            [],
            [
                [{ insertId: 43, affectedRows: 1 }, []],
                [[], []]
            ]
        );
        await assert.rejects(() => repository.create(input, missingReloadDb), /Equipment created but cannot be reloaded/);
    });

    it('maps duplicate normalized name and slug conflicts, and preserves unexpected errors', async () => {
        const repository = new EquipmentRepositoryMysql({} as Pool);
        const input = { name: 'Chinois', normalizedName: 'chinois', slug: 'chinois' };

        assert.deepEqual(
            await repository.create(input, createConnection([], [throwResponse(duplicateError('equipments_normalized_name_UK'))])),
            { status: 'normalized_name_taken' }
        );
        assert.deepEqual(await repository.create(input, createConnection([], [throwResponse(duplicateError('equipments_name_UK'))])), {
            status: 'normalized_name_taken'
        });
        assert.deepEqual(await repository.create(input, createConnection([], [throwResponse(duplicateError('equipments_slug_UK'))])), {
            status: 'slug_taken'
        });

        const unexpected = new Error('database unavailable');
        await assert.rejects(() => repository.create(input, createConnection([], [throwResponse(unexpected)])), (error: unknown) => error === unexpected);
    });
});

function createConnection(statements: Array<{ sql: string; params: unknown }>, responses: unknown[]): PoolConnection {
    return {
        async execute(sql: string, params: unknown) {
            statements.push({ sql, params });
            const response = responses.shift();

            if (!response)
                throw new Error('Unexpected SQL statement');
            if (isThrowResponse(response))
                throw response.error;

            return response;
        }
    } as unknown as PoolConnection;
}

function duplicateError(indexName: string): Error & { code: string } {
    return Object.assign(new Error(`Duplicate entry for key '${indexName}'`), {
        code: 'ER_DUP_ENTRY'
    });
}

function throwResponse(error: unknown): { error: unknown } {
    return { error };
}

function isThrowResponse(response: unknown): response is { error: unknown } {
    return typeof response === 'object' && response !== null && 'error' in response;
}
