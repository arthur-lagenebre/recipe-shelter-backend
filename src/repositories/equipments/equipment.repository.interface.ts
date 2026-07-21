import type { Equipment } from './equipment.types.js';
import type { PoolConnection } from 'mysql2/promise';

export type CreateEquipmentInput = { name: string; normalizedName: string; slug: string };

export type EquipmentWriteResult =
    { status: 'written'; equipment: Equipment } | { status: 'normalized_name_taken' } | { status: 'slug_taken' };

export interface EquipmentRepository {
    findAll(): Promise<Equipment[]>;
    findById(id: number): Promise<Equipment | null>;
    findByIdsForUpdate(ids: number[], db: PoolConnection): Promise<Equipment[]>;
    create(input: CreateEquipmentInput, db: PoolConnection): Promise<EquipmentWriteResult>;
    findAllForBackfill(): Promise<{ id: number; name: string }[]>;
}
