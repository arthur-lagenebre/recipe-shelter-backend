import { toDbError } from './errors.js';
import { pool } from './pool.js';
import { logger } from '../utils/logger.js';

import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

type ExecuteParams = Parameters<Pool['execute']>[1];
export type Queryable = Pool | PoolConnection;

const SLOW_QUERY_MS = 200;

function debugLog(sql: string, params: ExecuteParams | undefined, ms: number) {
    if (ms > SLOW_QUERY_MS) {
        logger.warn(`[db] SLOW ${ms.toFixed(1)}ms ${sql}`, params ? { params } : undefined);
        return;
    }

    logger.debug(`[db] ${ms.toFixed(1)}ms ${sql}`, params ? { params } : undefined);
}

export async function query<T extends RowDataPacket[] | ResultSetHeader>(
    sql: string,
    params?: ExecuteParams,
    conn?: Queryable
): Promise<T> {
    const start = performance.now();

    try {
        const executor = conn ?? pool;
        const [rows] = await executor.execute(sql, params);

        debugLog(sql, params, performance.now() - start);

        return rows as T;
    } catch (err) {
        logger.error(`[db] FAILED ${sql}`, { params });
        throw toDbError(err, sql);
    }
}
