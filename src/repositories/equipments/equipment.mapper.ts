import type { Equipment, EquipmentRow } from "./equipment.types.js";

export function mapEquipment(row: EquipmentRow): Equipment {
    return {
        id: row.Id,
        name: row.Name,
        slug: row.Slug
    };
}
