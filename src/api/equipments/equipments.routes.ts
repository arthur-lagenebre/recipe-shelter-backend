import { Router } from 'express';

import { requireAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type EquipmentsController = {
    getEquipments: RequestHandler;
    getEquipment: RequestHandler;
};

export function createEquipmentsRouter(controller: EquipmentsController) {
    const router = Router();

    router.get('/', requireAuth, controller.getEquipments);
    router.get('/:id', requireAuth, controller.getEquipment);

    return router;
}