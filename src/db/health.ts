import type { RowDataPacket } from 'mysql2/promise';
import { query } from './query.js';

type VersionRow = RowDataPacket & { v: string };

export async function dbHealth(): Promise<boolean> {
    try {
        const rows = await query<VersionRow[]>('SELECT VERSION() AS v');
        return typeof rows[0]?.v === 'string';
    } catch {
        return false;
    }
}