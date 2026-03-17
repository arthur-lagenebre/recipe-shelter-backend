import express from 'express';
import cors from 'cors';

import { createAuthRouter } from './api/auth/auth.routes.js';
import { authController } from './api/auth/auth.controller.js';
import { createHealthRouter } from './api/health/health.routes.js';
import { healthController } from './api/health/health.controller.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFound } from './middlewares/notFound.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: ['http://localhost:4200', 'http://127.0.0.1:4200'] }));

  app.use(express.json());

  app.use('/auth', createAuthRouter(authController));
  app.use('/health', createHealthRouter(healthController));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}