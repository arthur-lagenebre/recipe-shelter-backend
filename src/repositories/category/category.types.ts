import type { RowDataPacket } from 'mysql2';

export type Category = {
    id: number;
    name: string;
    slug: string;
    iconName: string;
    createdAt: Date;
    updatedAt: Date;
}

export type CategoryRow = RowDataPacket & {
    Id: number;
    Name: string;
    Slug: string;
    IconName: string;
    CreatedAt: Date;
    UpdatedAt: Date;
};
