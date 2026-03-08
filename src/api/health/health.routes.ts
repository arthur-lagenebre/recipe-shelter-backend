import type { Router } from '../http/router.js';
import type { Handler } from '../http/http.types.js';

export function registerHealthRoutes(router: Router, controller: { live: Handler; ready: Handler; health: Handler }) {
  router.get('/health/live', controller.live);
  router.get('/health/ready', controller.ready);
  router.get('/health', controller.health);
}