import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { pool } from "./pool.js";
import { dbConfig } from "./config.js";
import { toDbError } from "./errors.js";
import { logger } from "../utils/logger.js";

type ExecuteParams = Parameters<Pool["execute"]>[1];
export type Queryable = Pick<Pool, "execute">;

function debugLog(sql: string, params: ExecuteParams | undefined, ms: number) {
    if (!dbConfig.debug)
        return;

    logger.debug(`[db] ${ms.toFixed(1)}ms ${sql}`, params ? { params } : undefined);
}

export async function query<T extends RowDataPacket[] | ResultSetHeader>(sql: string, params?: ExecuteParams, conn?: Queryable): Promise<T> {
    const start = performance.now();
    try {
        const executor = conn ?? pool;
        const [rows] = await executor.execute(sql, params);

        debugLog(sql, params, performance.now() - start);

        return rows as T;
    } catch (err) {
        logger.error(`[db] FAILED ${sql}`, { params });
        throw toDbError(err, dbConfig.debug ? sql : undefined);
    }
}

export async function many<T extends RowDataPacket>(sql: string, params?: ExecuteParams, conn?: Queryable): Promise<T[]> {
    return query<T[]>(sql, params, conn);
}

export async function one<T extends RowDataPacket>(sql: string, params?: ExecuteParams, conn?: Queryable): Promise<T | null> {
    const rows = await many<T>(sql, params, conn);
    
    return rows[0] ?? null;
}

export async function exec(sql: string, params?: ExecuteParams, conn?: Queryable): Promise<ResultSetHeader> {
    return query<ResultSetHeader>(sql, params, conn);
}