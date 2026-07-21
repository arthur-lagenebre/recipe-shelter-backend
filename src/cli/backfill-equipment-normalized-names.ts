import { BackfillCollisionError, runBackfillEquipmentNormalizedNamesCommand } from './backfill-equipment-normalized-names.command.js';
import { pool } from '../db/pool.js';
import { EquipmentRepositoryMysql } from '../repositories/equipments/equipment.repository.mysql.js';

async function main(): Promise<void> {
    try {
        const repository = new EquipmentRepositoryMysql(pool);

        await runBackfillEquipmentNormalizedNamesCommand({
            repository,
            db: pool,
            writeOutput: (message) => process.stdout.write(`${message}\n`),
            writeWarning: (message) => process.stderr.write(`${message}\n`)
        });
    } catch (error) {
        if (!(error instanceof BackfillCollisionError))
            process.stderr.write(`BACKFILL_EQUIPMENT_NORMALIZED_NAMES_FAILED: ${error instanceof Error ? error.message : String(error)}\n`);

        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

void main();
