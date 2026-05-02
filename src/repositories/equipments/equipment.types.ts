import type { RowDataPacket } from 'mysql2';

export type Equipment = {
    id: number;
    name: string;
    slug: string;
};

export type EquipmentRow = RowDataPacket & {
    Id: number;
    Name: string;
    Slug: string;
};
