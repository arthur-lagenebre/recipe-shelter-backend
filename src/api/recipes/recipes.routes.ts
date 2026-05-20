import { Router } from 'express';

import { optionalAuth, requireAuth } from '../../middlewares/require-auth.js';

import type { RequestHandler } from 'express';

type RecipesController = {
  getMyRecipes: RequestHandler;
  createRecipe: RequestHandler;
  getRecipes: RequestHandler;
  searchRecipes: RequestHandler;
  getRecentRecipes: RequestHandler;
  getRecipe: RequestHandler;
  getRecipeBySlug: RequestHandler;
  updateRecipe: RequestHandler;
  submitRecipe: RequestHandler;
  archiveRecipe: RequestHandler;
};

export function createRecipesRouter(controller: RecipesController) {
  const router = Router();

  router.get('/me', requireAuth, controller.getMyRecipes);
  router.post('/', requireAuth, controller.createRecipe);
  router.get('/', optionalAuth, controller.getRecipes);
  router.get('/search', optionalAuth, controller.searchRecipes);
  router.get('/recent', optionalAuth, controller.getRecentRecipes);
  router.get('/:slug', optionalAuth, controller.getRecipeBySlug)
  router.get('/me/:id', requireAuth, controller.getRecipe)
  router.patch('/me/:id', requireAuth, controller.updateRecipe);
  router.post('/me/:id/submit', requireAuth, controller.submitRecipe);
  router.post('/me/:id/archive', requireAuth, controller.archiveRecipe);

  return router;
}
