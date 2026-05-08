import { Router } from 'express';

import type { RequestHandler } from 'express';

type EquipmentsController = {
    getEquipments: RequestHandler;
    getEquipment: RequestHandler;
};

export function createEquipmentsRouter(controller: EquipmentsController) {
    const router = Router();

    router.get('/', controller.getEquipments);
    router.get('/:id', controller.getEquipment);

    return router;
}