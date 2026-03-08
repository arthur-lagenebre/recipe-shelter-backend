import "dotenv/config";
import http from 'node:http';
import { readJsonBody, makeRes } from './api/http/http.utils.js';
import type { HttpRequest } from './api/http/http.types.js';
import { Router } from './api/http/router.js';
import { HttpError } from './utils/errors.js';

import { pool, dbHealth } from './db/index.js';
import { UserRepositoryMysql } from './repositories/users/UserRepository.mysql.js';
import { AuthService } from './services/auth/auth.service.js';
import { AuthController } from './api/auth/auth.controller.js';
import { registerAuthRoutes } from './api/auth/auth.routes.js';
import { createHealthController } from './api/health/health.controller.js';
import { registerHealthRoutes } from './api/health/health.routes.js';

const router = new Router();
const userRepo = new UserRepositoryMysql(pool);
const authService = new AuthService(userRepo);
const authController = new AuthController(authService);

registerAuthRoutes(router, authController);

const healthController = createHealthController(dbHealth);
registerHealthRoutes(router, healthController);

router.get('/', (_request, result) => {
  result.status(200).json({
    message: 'Recipe Shelter API',
    timestamp: new Date().toISOString(),
  });
});

const handler = router.handler();

const server = http.createServer(async (request, result) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  const httpReq: HttpRequest = {
    method: (request.method ?? 'GET') as HttpRequest['method'],
    url,
    headers: request.headers as any,
    body: undefined,
  };

  try {
    httpReq.body = await readJsonBody(request);

    const httpRes = makeRes(result);

    await handler(httpReq, httpRes, (error?: unknown) => {
      if (!error)
        return;

      if (error instanceof HttpError) {
        return httpRes
          .status(error.status)
          .json({ error: { message: error.message, code: error.code } });
      }

      console.error(error);

      return httpRes.status(500).json({ error: { message: 'Internal Server Error' } });
    });

  } catch (error) {
    const httpRes = makeRes(result);

    if (error instanceof HttpError) {
      return httpRes
        .status(error.status)
        .json({ error: { message: error.message, code: error.code } });
    }

    console.error(error);

    return httpRes.status(500).json({ error: { message: 'Internal Server Error' } });
  }
});

const port = Number(process.env.PORT ?? 3000);

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});