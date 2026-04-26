import { parseEquipmentIdParam } from './equipments.dto.js';
import { asyncHandler } from '../http/async-handler.js';

import type { EquipmentService } from '../../services/equipments/equipments.service.js';

export function createEquipmentsController(equipmentService: EquipmentService) {
    return {
        getEquipments: asyncHandler(async (req, res) => {
            const equipments = await equipmentService.getEquipments();
            res.status(200).json({ data: equipments });
        }),

        getEquipment: asyncHandler(async (req, res) => {
            const equipmentId = parseEquipmentIdParam(req.params.id);
            const equipment = await equipmentService.getEquipment(equipmentId);
            res.status(200).json({ data: equipment });
        })
    };
}