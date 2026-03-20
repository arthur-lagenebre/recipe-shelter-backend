import cors from 'cors';
import express from 'express';
import { createPool } from 'mysql2/promise';

import { authController } from './api/auth/auth.controller.js';
import { createAuthRouter } from './api/auth/auth.routes.js';
import { healthController } from './api/health/health.controller.js';
import { createHealthRouter } from './api/health/health.routes.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { PasswordResetRepositoryMysql } from './repositories/auth/password-reset.repository.mysql.js';
import { UserRepositoryMysql } from './repositories/users/user-repository.mysql.js';
import { PasswordResetService } from './services/auth/password-reset.service.js';
import { ConsoleMailer } from './services/mail/console.mailer.js';
import { env } from './utils/env.js';

export function createApp() {
  const app = express();

  const origins = env.http.corsAllowedOrigins.split(',');

  app.use(cors({ origin: origins }));
  app.use(express.json());

  const db = createPool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
    connectionLimit: env.db.connectionLimit,
  });

  const userRepository = new UserRepositoryMysql(db);
  const passwordResetRepository = new PasswordResetRepositoryMysql(db);
  const mailer = new ConsoleMailer();

  const passwordResetService = new PasswordResetService(userRepository, passwordResetRepository, mailer, env.http.frontendBaseUrl);

  app.use('/auth', createAuthRouter(authController, passwordResetService));
  app.use('/health', createHealthRouter(healthController));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}