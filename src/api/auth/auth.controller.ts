import { dbHealth } from '../../db/health.js';

import type { Handler } from '../http/http.types.js';

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
      checks: {
        db: dbOk,
      },
    },
  };
}

export const live: Handler = async (_req, res, next) => {
  try {
    res.status(200).json({ ok: true });
    return;
  } catch (error) {
    next(error);
    return;
  }
};

export const ready: Handler = async (_req, res, next) => {
  try {
    const result = await buildHealthResponse();
    res.status(result.status).json(result.body);
    return;
  } catch (error) {
    next(error);
    return;
  }
};

export const health: Handler = ready;

export const healthController = { live, ready, health };