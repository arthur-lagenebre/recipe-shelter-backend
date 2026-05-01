import type { Equipment, EquipmentRow } from "./equipment.types.js";

export function mapEquipment(row: EquipmentRow): Equipment {
    return {
        id: row.id,
        name: row.name,
        slug: row.slug
    };
}
