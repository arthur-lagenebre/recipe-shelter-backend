import { Router } from 'express';

import { requireAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type RecipesController = {
  getMyRecipes: RequestHandler;
  createRecipe: RequestHandler;
  getRecipe: RequestHandler;
  updateRecipe: RequestHandler;
  submitRecipe: RequestHandler;
};

export function createRecipesRouter(controller: RecipesController) {
  const router = Router();

  router.get('/me', requireAuth, controller.getMyRecipes);
  router.post('/', requireAuth, controller.createRecipe);
  router.get('/:id', requireAuth, controller.getRecipe)
  router.put('/:id', requireAuth, controller.updateRecipe);
  router.put('/:id/submit', requireAuth, controller.submitRecipe);

  return router;
}
