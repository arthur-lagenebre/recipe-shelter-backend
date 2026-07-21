import { normalizeEquipmentName } from '../services/equipments/equipments.service.js';

import type { EquipmentRepository } from '../repositories/equipments/equipment.repository.interface.js';

export class BackfillCollisionError extends Error {
    constructor() {
        super('Equipment normalized name collisions must be resolved before this script can complete.');
        this.name = 'BackfillCollisionError';
    }
}

type CommandDependencies = {
    repository: Pick<EquipmentRepository, 'findAllForBackfill'>;
    db: { execute(sql: string, params: Array<string | number>): Promise<unknown> };
    writeOutput(message: string): void;
    writeWarning(message: string): void;
};

export async function runBackfillEquipmentNormalizedNamesCommand(dependencies: CommandDependencies): Promise<void> {
    const equipments = await dependencies.repository.findAllForBackfill();
    const byNormalizedName = new Map<string, Array<{ id: number; name: string }>>();

    for (const equipment of equipments) {
        const normalizedName = normalizeEquipmentName(equipment.name);
        const group = byNormalizedName.get(normalizedName);

        if (group) group.push(equipment);
        else byNormalizedName.set(normalizedName, [equipment]);
    }

    const collisions = [...byNormalizedName.entries()].filter(([, group]) => group.length > 1);

    if (collisions.length > 0) {
        dependencies.writeWarning('Cannot backfill: several equipments normalize to the same canonical name.');

        for (const [normalizedName, group] of collisions) {
            dependencies.writeWarning(
                `  "${normalizedName}" <- ${group.map((equipment) => `#${equipment.id} (${equipment.name})`).join(', ')}`
            );
        }

        dependencies.writeWarning('Rename or merge the conflicting equipments by hand, then re-run this script.');

        throw new BackfillCollisionError();
    }

    for (const equipment of equipments) {
        const normalizedName = normalizeEquipmentName(equipment.name);

        await dependencies.db.execute('UPDATE Equipments SET NormalizedName = ? WHERE Id = ?', [normalizedName, equipment.id]);
    }

    dependencies.writeOutput(`Backfilled NormalizedName for ${equipments.length} equipment(s).`);
}
