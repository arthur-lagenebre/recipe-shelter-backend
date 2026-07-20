import { Router } from 'express';

import { CommunityOnly } from '../../middlewares/authorization.js';
import { uploadRecipeImage } from '../../middlewares/recipe-image-upload.js';
import { optionalCommunityAuth, requireCommunityAuth } from '../../middlewares/require-auth.js';

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

  router.get('/me', requireCommunityAuth, controller.getMyRecipes);
  router.post('/', requireCommunityAuth, CommunityOnly, controller.createRecipe);
  router.get('/', optionalCommunityAuth, controller.getRecipes);
  router.get('/search', optionalCommunityAuth, controller.searchRecipes);
  router.get('/recent', optionalCommunityAuth, controller.getRecentRecipes);
  router.put('/:recipeId/cover-image', requireCommunityAuth, CommunityOnly, uploadRecipeImage, controller.replaceCoverImage);
  router.delete('/:recipeId/cover-image', requireCommunityAuth, CommunityOnly, controller.deleteCoverImage);
  router.get('/:slug', optionalCommunityAuth, controller.getRecipeBySlug);
  router.get('/me/:id', requireCommunityAuth, controller.getRecipe);
  router.patch('/me/:id', requireCommunityAuth, CommunityOnly, controller.updateRecipe);
  router.post('/me/:id/submit', requireCommunityAuth, CommunityOnly, controller.submitRecipe);
  router.post('/me/:id/archive', requireCommunityAuth, CommunityOnly, controller.archiveRecipe);

  return router;
}
