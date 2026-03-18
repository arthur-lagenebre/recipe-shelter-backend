import express from 'express';
import cors from 'cors';

import { createAuthRouter } from './api/auth/auth.routes.js';
import { authController } from './api/auth/auth.controller.js';
import { createHealthRouter } from './api/health/health.routes.js';
import { healthController } from './api/health/health.controller.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';

import { env } from './utils/env.js';

export function createApp() {
  const app = express();

  const origins = env.http.corsAllowedOrigins.split(',');

  app.use(cors({ origin: origins }));

  app.use(express.json());

  app.use('/auth', createAuthRouter(authController));
  app.use('/health', createHealthRouter(healthController));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}