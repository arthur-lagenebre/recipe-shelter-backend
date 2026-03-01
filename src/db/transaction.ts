import type { PoolConnection } from "mysql2/promise";
import { pool } from "./pool.js";
import { logger } from "../utils/logger.js";
import { dbConfig } from "./config.js";

export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const result = await fn(conn);
        await conn.commit();
        
        return result;
    } catch (err) {
        try {
            await conn.rollback();
        } catch (rbErr) {
            logger.error("[db] rollback failed", rbErr);
        }
        throw err;
    } finally {
        conn.release();

        if (dbConfig.debug)
            logger.debug("[db] connection released");
    }
}