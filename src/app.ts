import cors from 'cors';
import express from 'express';

import { createAuthController } from './api/auth/auth.controller.js';
import { createAuthRouter } from './api/auth/auth.routes.js';
import { healthController } from './api/health/health.controller.js';
import { createHealthRouter } from './api/health/health.routes.js';
import { createUsersController } from './api/users/users.controller.js';
import { createUsersRouter } from './api/users/users.routes.js';
import { pool } from './db/pool.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { PasswordResetRepositoryMysql } from './repositories/auth/password-reset.repository.mysql.js';
import { UserRepositoryMysql } from './repositories/users/user-repository.mysql.js';
import { AuthService } from './services/auth/auth.service.js';
import { PasswordResetService } from './services/auth/password-reset.service.js';
import { ConsoleMailer } from './services/mail/console.mailer.js';
import { UserService } from './services/users/users.service.js';
import { env } from './utils/env.js';

export function createApp() {
  const app = express();

  const origins = env.http.corsAllowedOrigins.split(',');

  app.use(cors({ origin: origins }));
  app.use(express.json());

  const userRepository = new UserRepositoryMysql(pool);
  const passwordResetRepository = new PasswordResetRepositoryMysql(pool);
  const mailer = new ConsoleMailer();

  const authService = new AuthService(userRepository);
  const usersService = new UserService(userRepository);
  const passwordResetService = new PasswordResetService(userRepository, passwordResetRepository, mailer, env.http.frontendBaseUrl);
  const authController = createAuthController(authService);
  const usersController = createUsersController(usersService);

  app.use('/auth', createAuthRouter(authController, passwordResetService));
  app.use('/health', createHealthRouter(healthController));
  app.use('/users', createUsersRouter(usersController));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
