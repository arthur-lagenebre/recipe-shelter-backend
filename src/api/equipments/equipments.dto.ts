import { badRequest } from '../../utils/errors.js';

export function parseEquipmentIdParam(value: unknown): number {
    const equipmentId = typeof value === 'string' ? Number(value) : NaN;

    if (!Number.isInteger(equipmentId) || equipmentId <= 0)
        throw badRequest('Equipment id must be a positive integer', 'EQUIPMENT_BAD_ID');

    return equipmentId;
}
