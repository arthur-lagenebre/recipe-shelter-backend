import { Router } from 'express';

import { CommunityOnly } from '../../middlewares/authorization.js';
import { uploadRecipeImage } from '../../middlewares/recipe-image-upload.js';
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
  replaceCoverImage: RequestHandler;
  deleteCoverImage: RequestHandler;
};

export function createRecipesRouter(controller: RecipesController) {
  const router = Router();

  router.get('/me', requireAuth, controller.getMyRecipes);
  router.post('/', requireAuth, CommunityOnly, controller.createRecipe);
  router.get('/', optionalAuth, controller.getRecipes);
  router.get('/search', optionalAuth, controller.searchRecipes);
  router.get('/recent', optionalAuth, controller.getRecentRecipes);
  router.put('/:recipeId/cover-image', requireAuth, CommunityOnly, uploadRecipeImage, controller.replaceCoverImage);
  router.delete('/:recipeId/cover-image', requireAuth, CommunityOnly, controller.deleteCoverImage);
  router.get('/:slug', optionalAuth, controller.getRecipeBySlug)
  router.get('/me/:id', requireAuth, controller.getRecipe)
  router.patch('/me/:id', requireAuth, CommunityOnly, controller.updateRecipe);
  router.post('/me/:id/submit', requireAuth, CommunityOnly, controller.submitRecipe);
  router.post('/me/:id/archive', requireAuth, CommunityOnly, controller.archiveRecipe);

  return router;
}
