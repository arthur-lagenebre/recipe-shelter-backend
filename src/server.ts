import 'dotenv/config';
import http from 'node:http';

import { env } from './utils/env.js';
import { readJsonBody, makeRes } from './api/http/http.utils.js';
import type { HttpRequest } from './api/http/http.types.js';
import { Router } from './api/http/router.js';

import { pool, dbHealth } from './db/index.js';
import { UserRepositoryMysql } from './repositories/users/UserRepository.mysql.js';
import { AuthService } from './services/auth/auth.service.js';
import { AuthController } from './api/auth/auth.controller.js';
import { registerAuthRoutes } from './api/auth/auth.routes.js';
import { createHealthController } from './api/health/health.controller.js';
import { registerHealthRoutes } from './api/health/health.routes.js';

import { applyCors, handlePreflight } from './api/http/cors.js';
import { handleHttpError } from './api/http/error-handler.js';

const router = new Router();

const userRepo = new UserRepositoryMysql(pool);
const authService = new AuthService(userRepo);
const authController = new AuthController(authService);

registerAuthRoutes(router, authController);

const healthController = createHealthController(dbHealth);
registerHealthRoutes(router, healthController);

router.get('/', (_request, response) => {
  response.status(200).json({
    message: 'Recipe Shelter API',
    timestamp: new Date().toISOString(),
  });
});

const handler = router.handler();

const server = http.createServer(async (request, result) => {
  const response = makeRes(result);

  applyCors(request.headers.origin, response);

  const method = (request.method ?? 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    response.status(204).send();
    return;
  }

  if (handlePreflight(method, response))
    return;

  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  const httpReq: HttpRequest = {
    method: method as HttpRequest['method'],
    url,
    headers: request.headers,
  };

  try {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method))
      httpReq.body = await readJsonBody(request);

    await handler(httpReq, response, (error?: unknown) => {
      if (error)
        handleHttpError(response, error);
    });
  } catch (error) {
    handleHttpError(response, error);
  }
});

server.listen(env.http.port, () => {
  console.log(`Server running on http://localhost:${env.http.port}`);
});