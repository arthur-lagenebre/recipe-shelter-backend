import { dbHealth } from '../../db/health.js';
import { asyncHandler } from '../http/async-handler.js';

type HealthResponse = {
    status: number;
    body: {
        ok: boolean;
        checks: {
            db: boolean;
        };
    };
};

async function buildHealthResponse(checkDb: () => Promise<boolean>): Promise<HealthResponse> {
    const dbOk = await checkDb();

    return {
        status: dbOk ? 200 : 503,
        body: {
            ok: dbOk,
            checks: { db: dbOk }
        }
    };
}

export function createHealthController(checkDb: () => Promise<boolean> = dbHealth) {
    const live = asyncHandler(async (_req, res) => {
        res.status(200).json({ ok: true });
    });

    const ready = asyncHandler(async (_req, res) => {
        const result = await buildHealthResponse(checkDb);
        res.status(result.status).json(result.body);
    });

    return { live, ready, health: ready };
}

export const healthController = createHealthController();
