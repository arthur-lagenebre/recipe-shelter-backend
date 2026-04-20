import { parseEquipmentIdParam } from './equipments.dto.js';
import { asyncHandler } from '../http/async-handler.js';

import type { EquipmentService } from '../../services/equipments/equipments.service.js';

export function createEquipmentsContoller(equipmentService: EquipmentService) {
    return {
        getEquipments: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }

            const ingredients = await equipmentService.getEquipments();
            res.status(200).json(ingredients);
        }),

        getEquipment: asyncHandler(async (req, res) => {
            if (!req.auth) {
                res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

                return;
            }
            
            const equipmentId = parseEquipmentIdParam(req.params.id);
            const profile = await equipmentService.getEquipment(equipmentId);
            res.status(200).json(profile);
        })
    };
}