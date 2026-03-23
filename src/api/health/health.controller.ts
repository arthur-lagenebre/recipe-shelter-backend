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

async function buildHealthResponse(): Promise<HealthResponse> {
  const dbOk = await dbHealth();

  return {
    status: dbOk ? 200 : 503,
    body: {
      ok: dbOk,
      checks: { db: dbOk }
    }
  };
}

export const live = asyncHandler(async (_req, res) => {
  res.status(200).json({ ok: true });
});

export const ready = asyncHandler(async (_req, res) => {
  const result = await buildHealthResponse();
  res.status(result.status).json(result.body);
});

export const health = ready;

export const healthController = { live, ready, health };