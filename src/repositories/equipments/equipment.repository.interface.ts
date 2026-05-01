import type { Equipment } from "./equipment.types.js";

export interface EquipmentRepository {
    findAll(): Promise<Equipment[]>;
    findById(id: number): Promise<Equipment | null>;
}