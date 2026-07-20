import { notFound } from '../../utils/errors.js';

import type { EquipmentRepository } from '../../repositories/equipments/equipment.repository.interface.js';
import type { Equipment } from '../../repositories/equipments/equipment.types.js';

export class EquipmentService {
    constructor(private readonly equipmentRepository: EquipmentRepository) {}

    async getEquipments(): Promise<Equipment[]> {
        const equipments = await this.equipmentRepository.findAll();

        if (!equipments) throw notFound('Equipments not found', 'EQUIPMENTS_NOT_FOUND');

        return equipments;
    }

    async getEquipment(equipmentId: number): Promise<Equipment> {
        const equipment = await this.equipmentRepository.findById(equipmentId);

        if (!equipment) throw notFound('Equipment not found', 'EQUIPMENT_NOT_FOUND');

        return equipment;
    }
}
