import { Router } from 'express';
import type { RequestHandler } from 'express';
import { requireAuth } from '../../middlewares/requireAuth.js';

type AuthController = {
  register: RequestHandler;
  login: RequestHandler;
};

export function createAuthRouter(controller: AuthController) {
  const router = Router();

  router.post('/register', controller.register);
  router.post('/login', controller.login);

  router.get('/me', requireAuth, (req, res) => { res.status(200).json({ auth: req.auth }); });

  return router;
}