import type { RowDataPacket } from 'mysql2';

export type Equipment = {
    id: number;
    name: string;
    normalizedName: string;
    slug: string;
};

export type EquipmentRow = RowDataPacket & {
    Id: number;
    Name: string;
    NormalizedName: string;
    Slug: string;
};
