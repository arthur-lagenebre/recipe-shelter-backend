import { pool } from './pool.js';

import type { PoolConnection } from 'mysql2/promise';

export async function transaction<T>(fn: (tx: PoolConnection) => Promise<T>): Promise<T> {
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        const result = await fn(conn);

        await conn.commit();

        return result;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}
