import { Router } from 'express';
import type { RequestHandler } from 'express';

type HealthController = {
  live: RequestHandler;
  ready: RequestHandler;
  health: RequestHandler;
};

export function createHealthRouter(controller: HealthController) {
  const router = Router();

  router.get('/live', controller.live);
  router.get('/ready', controller.ready);
  router.get('/', controller.health);

  return router;
}