import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BackfillCollisionError, runBackfillEquipmentNormalizedNamesCommand } from '../../src/cli/backfill-equipment-normalized-names.command.js';

describe('backfill equipment normalized names command', () => {
    it('normalizes every equipment name and writes it back by id', async () => {
        const equipments = [
            { id: 1, name: 'Crème brûlée' },
            { id: 2, name: 'Coupe-œuf' },
            { id: 3, name: '  Fouet  ' }
        ];
        const updates: Array<{ sql: string; params: unknown[] }> = [];
        const outputs: string[] = [];

        await runBackfillEquipmentNormalizedNamesCommand({
            repository: {
                async findAllForBackfill() {
                    return equipments;
                }
            },
            db: {
                async execute(sql: string, params: unknown[]) {
                    updates.push({ sql, params });
                    return [{ affectedRows: 1 }, []];
                }
            },
            writeOutput(message) {
                outputs.push(message);
            },
            writeWarning() {
                throw new Error('should not warn when there is no collision');
            }
        });

        assert.deepEqual(
            updates.map(({ params }) => params),
            [
                ['creme brulee', 1],
                ['coupe oeuf', 2],
                ['fouet', 3]
            ]
        );
        assert.ok(updates.every(({ sql }) => /UPDATE Equipments SET NormalizedName = \? WHERE Id = \?/.test(sql)));
        assert.deepEqual(outputs, ['Backfilled NormalizedName for 3 equipment(s).']);
    });

    it('aborts without writing anything and warns on normalized name collisions', async () => {
        const equipments = [
            { id: 1, name: 'Fouet' },
            { id: 2, name: 'FOUET' },
            { id: 3, name: 'Louche' }
        ];
        const updates: unknown[] = [];
        const warnings: string[] = [];

        await assert.rejects(
            () =>
                runBackfillEquipmentNormalizedNamesCommand({
                    repository: {
                        async findAllForBackfill() {
                            return equipments;
                        }
                    },
                    db: {
                        async execute(sql: string, params: unknown[]) {
                            updates.push({ sql, params });
                            return [{ affectedRows: 1 }, []];
                        }
                    },
                    writeOutput() {
                        throw new Error('should not report success when a collision is found');
                    },
                    writeWarning(message) {
                        warnings.push(message);
                    }
                }),
            (error) => error instanceof BackfillCollisionError
        );

        assert.equal(updates.length, 0);
        assert.ok(warnings.some((message) => message.includes('#1 (Fouet)') && message.includes('#2 (FOUET)')));
    });
});
