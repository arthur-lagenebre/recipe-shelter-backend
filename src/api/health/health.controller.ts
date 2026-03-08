import type { Handler } from '../http/http.types.js';

export function createHealthController(dbHealth: () => Promise<boolean>) {
  const live: Handler = async (_req, result) => {
    result.status(200).json({
      status: 'ok',
      live: true,
      timestamp: new Date().toISOString(),
    });
  };

  const ready: Handler = async (_req, result) => {
    const ok: boolean = await dbHealth();

    result.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'error',
      ready: ok,
      database: ok ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    });
  };

  const health: Handler = async (_req, result) => {
    const ok: boolean = await dbHealth();

    result.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'error',
      live: true,
      ready: ok,
      database: ok ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    });
  };

  return { live, ready, health };
}