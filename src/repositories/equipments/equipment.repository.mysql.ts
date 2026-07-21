import { mapEquipment } from './equipment.mapper.js';
import { firstOrNull } from '../../utils/array.js';

import type { CreateEquipmentInput, EquipmentRepository, EquipmentWriteResult } from './equipment.repository.interface.js';
import type { Equipment, EquipmentRow } from './equipment.types.js';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

const EQUIPMENT_SELECT = 'Id, Name, NormalizedName, Slug';

type BackfillRow = RowDataPacket & { Id: number; Name: string };

export class EquipmentRepositoryMysql implements EquipmentRepository {
    constructor(private readonly db: Pool) {}

    async findAll(): Promise<Equipment[]> {
        const [rows] = await this.db.execute(`SELECT ${EQUIPMENT_SELECT} FROM Equipments`);

        return (rows as EquipmentRow[]).map(mapEquipment);
    }

    async findById(id: number): Promise<Equipment | null> {
        const [rows] = await this.db.execute(`SELECT ${EQUIPMENT_SELECT} FROM Equipments WHERE Id = ?`, [id]);

        const row = firstOrNull(rows as EquipmentRow[]);
        return row ? mapEquipment(row) : null;
    }

    async findByIdsForUpdate(ids: number[], db: PoolConnection): Promise<Equipment[]> {
        if (ids.length === 0) return [];

        const placeholders = ids.map(() => '?').join(', ');
        const [rows] = await db.execute<EquipmentRow[]>(
            `SELECT ${EQUIPMENT_SELECT}
             FROM Equipments
             WHERE Id IN (${placeholders})
             ORDER BY Id ASC
             FOR UPDATE`,
            ids
        );

        return rows.map(mapEquipment);
    }

    async create(input: CreateEquipmentInput, db: PoolConnection): Promise<EquipmentWriteResult> {
        try {
            const [result] = await db.execute<ResultSetHeader>(`INSERT INTO Equipments (Name, NormalizedName, Slug) VALUES (?, ?, ?)`, [
                input.name,
                input.normalizedName,
                input.slug
            ]);
            const equipment = await this.findByIdForUpdate(Number(result.insertId), db);

            if (!equipment) throw new Error('Equipment created but cannot be reloaded');

            return { status: 'written', equipment };
        } catch (error) {
            const duplicateStatus = getDuplicateEquipmentStatus(error);
            if (duplicateStatus) return { status: duplicateStatus };

            throw error;
        }
    }

    async findAllForBackfill(): Promise<{ id: number; name: string }[]> {
        const [rows] = await this.db.execute<BackfillRow[]>(`SELECT Id, Name FROM Equipments ORDER BY Id ASC`);

        return rows.map((row) => ({ id: Number(row.Id), name: row.Name }));
    }

    private async findByIdForUpdate(id: number, db: PoolConnection): Promise<Equipment | null> {
        const [rows] = await db.execute<EquipmentRow[]>(`SELECT ${EQUIPMENT_SELECT} FROM Equipments WHERE Id = ?`, [id]);
        const row = firstOrNull(rows);

        return row ? mapEquipment(row) : null;
    }
}

function getDuplicateEquipmentStatus(error: unknown): 'normalized_name_taken' | 'slug_taken' | null {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ER_DUP_ENTRY') return null;

    const message = 'message' in error ? String(error.message) : '';

    if (message.includes('equipments_normalized_name_UK')) return 'normalized_name_taken';
    if (message.includes('equipments_name_UK')) return 'normalized_name_taken';
    if (message.includes('equipments_slug_UK')) return 'slug_taken';

    return null;
}
