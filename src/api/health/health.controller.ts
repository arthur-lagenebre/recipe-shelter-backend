import { dbHealth } from '../../db/health.js';

import type { RequestHandler } from 'express';

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

export const live: RequestHandler = async (_req, res, next) => {
  try {
    return res.status(200).json({ ok: true });
  } catch (error) {
    return next(error);
  }
};

export const ready: RequestHandler = async (_req, res, next) => {
  try {
    const result = await buildHealthResponse();
    return res.status(result.status).json(result.body);
  } catch (error) {
    return next(error);
  }
};

export const health: RequestHandler = ready;

export const healthController = { live, ready, health };