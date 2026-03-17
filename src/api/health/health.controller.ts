import type { RequestHandler } from 'express';
import { dbHealth } from '../../db/health.js';

export const live: RequestHandler = async (_req, res, next) => {
  try {
    return res.status(200).json({ ok: true });
  } catch (error) {
    return next(error);
  }
};

export const ready: RequestHandler = async (_req, res, next) => {
  try {
    const dbOk = await dbHealth();

    return res.status(dbOk ? 200 : 503).json({
      ok: dbOk,
      checks: {
        db: dbOk,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const health: RequestHandler = async (_req, res, next) => {
  try {
    const dbOk = await dbHealth();

    return res.status(dbOk ? 200 : 503).json({
      ok: dbOk,
      checks: {
        db: dbOk,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const healthController = { live, ready, health };