
import { mapEquipment } from './equipment.mapper.js';
import { type EquipmentRepository } from "./equipment.repository.interface.js";
import { type Equipment, type EquipmentRow } from "./equipment.types.js";
import { firstOrNull } from '../../utils/array.js';

import type { Pool } from 'mysql2/promise';

export class EquipmentRepositoryMysql implements EquipmentRepository {
    constructor(private readonly db: Pool) { }

    async findAll(): Promise<Equipment[]> {
        const [rows] = await this.db.execute(
            `SELECT Id, Name, Slug
             FROM Equipements`);

        return (rows as EquipmentRow[]).map(mapEquipment);
    }

    async findById(id: number): Promise<Equipment | null> {
        const [rows] = await this.db.execute(
            `SELECT Id, Name, Slug
             FROM Equipements
             WHERE i.Id = ?`,
            [id]
        );

        const row = firstOrNull(rows as EquipmentRow[]);
        return row ? mapEquipment(row) : null;
    }
}
