import type { Router } from '../http/router.js';
import type { Handler } from '../http/http.types.js';
import { requireAuth } from '../../middlewares/requireAuth.js';

export function registerAuthRoutes(router: Router, controller: { register: Handler; login: Handler }) {
  router.post('/auth/register', controller.register);
  router.post('/auth/login', controller.login);

  router.get('/auth/me', requireAuth, (req, res) => {
    res.status(200).json({ auth: req.auth });
  });
}