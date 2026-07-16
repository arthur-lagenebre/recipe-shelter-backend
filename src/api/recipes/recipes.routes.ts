import { Router } from 'express';

import { uploadRecipeImage } from '../../middlewares/recipe-image-upload.js';
import { optionalAuth, requireAuth } from '../../middlewares/require-auth.js';
import { requireCommunityAccount } from '../../services/auth/authorization.service.js';

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
  router.post('/', requireAuth, requireCommunityAccount, controller.createRecipe);
  router.get('/', optionalAuth, controller.getRecipes);
  router.get('/search', optionalAuth, controller.searchRecipes);
  router.get('/recent', optionalAuth, controller.getRecentRecipes);
  router.put('/:recipeId/cover-image', requireAuth, requireCommunityAccount, uploadRecipeImage, controller.replaceCoverImage);
  router.delete('/:recipeId/cover-image', requireAuth, requireCommunityAccount, controller.deleteCoverImage);
  router.get('/:slug', optionalAuth, controller.getRecipeBySlug)
  router.get('/me/:id', requireAuth, controller.getRecipe)
  router.patch('/me/:id', requireAuth, requireCommunityAccount, controller.updateRecipe);
  router.post('/me/:id/submit', requireAuth, requireCommunityAccount, controller.submitRecipe);
  router.post('/me/:id/archive', requireAuth, requireCommunityAccount, controller.archiveRecipe);

  return router;
}
