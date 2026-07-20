import { mapEquipment } from './equipment.mapper.js';
import { firstOrNull } from '../../utils/array.js';

import type { EquipmentRepository } from './equipment.repository.interface.js';
import type { Equipment, EquipmentRow } from './equipment.types.js';
import type { Pool } from 'mysql2/promise';

export class EquipmentRepositoryMysql implements EquipmentRepository {
    constructor(private readonly db: Pool) {}

    async findAll(): Promise<Equipment[]> {
        const [rows] = await this.db.execute(
            `SELECT Id, Name, Slug
             FROM Equipments`
        );

        return (rows as EquipmentRow[]).map(mapEquipment);
    }

    async findById(id: number): Promise<Equipment | null> {
        const [rows] = await this.db.execute(
            `SELECT Id, Name, Slug
             FROM Equipments
             WHERE Id = ?`,
            [id]
        );

        const row = firstOrNull(rows as EquipmentRow[]);
        return row ? mapEquipment(row) : null;
    }
}
