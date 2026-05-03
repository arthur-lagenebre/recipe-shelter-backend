import cors from 'cors';
import express from 'express';

import { createAdminRecipesController } from './api/admin/admin-recipes.controller.js';
import { createAdminRecipesRouter } from './api/admin/admin-recipes.routes.js';
import { createAuthController } from './api/auth/auth.controller.js';
import { createAuthRouter } from './api/auth/auth.routes.js';
import { createCategoryController } from './api/category/category.controller.js';
import { createCategoryRouter } from './api/category/category.routes.js';
import { createEquipmentsController } from './api/equipments/equipments.controller.js';
import { createEquipmentsRouter } from './api/equipments/equipments.routes.js';
import { healthController } from './api/health/health.controller.js';
import { createHealthRouter } from './api/health/health.routes.js';
import { createIngredientsController } from './api/ingredients/ingredients.controller.js';
import { createIngredientsRouter } from './api/ingredients/ingredients.routes.js';
import { createRecipesController } from './api/recipes/recipes.controller.js';
import { createRecipesRouter } from './api/recipes/recipes.routes.js';
import { createTagsController } from './api/tag/tags.controller.js';
import { createTagssRouter } from './api/tag/tags.routes.js';
import { createUsersController } from './api/users/users.controller.js';
import { createUsersRouter } from './api/users/users.routes.js';
import { pool } from './db/pool.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { AdminRecipeRepositoryMysql } from './repositories/admin/admin.recipe.repository.mysql.js';
import { PasswordResetRepositoryMysql } from './repositories/auth/password-reset.repository.mysql.js';
import { CategoryRepositoryMysql } from './repositories/category/category.repository.mysql.js';
import { EquipmentRepositoryMysql } from './repositories/equipments/equipment.repository.mysql.js';
import { IngredientRepositoryMysql } from './repositories/ingredients/ingredient.repository.mysql.js';
import { RecipeRepositoryMysql } from './repositories/recipes/recipe.repository.mysql.js';
import { TagRepositoryMysql } from './repositories/tag/tag.repository.mysql.js';
import { UserRepositoryMysql } from './repositories/users/user.repository.mysql.js';
import { AdminRecipeService } from './services/admin/admin.recipes.services.js';
import { AuthService } from './services/auth/auth.service.js';
import { PasswordResetService } from './services/auth/password-reset.service.js';
import { CategoryService } from './services/category/category.service.js';
import { EquipmentService } from './services/equipments/equipments.service.js';
import { IngredientService } from './services/ingredients/ingredients.service.js';
import { ConsoleMailer } from './services/mail/console.mailer.js';
import { RecipeSlugService } from './services/recipes/recipe-slug.service.js';
import { RecipeService } from './services/recipes/recipes.services.js';
import { TagService } from './services/tag/tags.service.js';
import { UserService } from './services/users/users.service.js';
import { env } from './utils/env.js';

export function createApp() {
  const app = express();

  const origins = env.http.corsAllowedOrigins.split(',');

  app.use(cors({ origin: origins }));
  app.use(express.json());

  const mailer = new ConsoleMailer();

  const adminRecipeRepository = new AdminRecipeRepositoryMysql(pool);
  const categoryRepository = new CategoryRepositoryMysql(pool);
  const equipmentRepository = new EquipmentRepositoryMysql(pool);
  const ingredientRepository = new IngredientRepositoryMysql(pool);
  const passwordResetRepository = new PasswordResetRepositoryMysql(pool);
  const recipeRepository = new RecipeRepositoryMysql(pool);
  const tagRepository = new TagRepositoryMysql(pool);
  const userRepository = new UserRepositoryMysql(pool);

  const adminRecipeService = new AdminRecipeService(recipeRepository, adminRecipeRepository);
  const authService = new AuthService(userRepository);
  const equipmentService = new EquipmentService(equipmentRepository);
  const ingredientService = new IngredientService(ingredientRepository);
  const passwordResetService = new PasswordResetService(userRepository, passwordResetRepository, mailer, env.http.frontendBaseUrl);
  const recipeSlugService = new RecipeSlugService(recipeRepository);
  const recipeService = new RecipeService(recipeRepository, recipeSlugService);
  const categoryService = new CategoryService(categoryRepository);
  const tagService = new TagService(tagRepository);
  const usersService = new UserService(userRepository);

  const adminRecipesController = createAdminRecipesController(adminRecipeService);
  const authController = createAuthController(authService, passwordResetService);
  const categoryController = createCategoryController(categoryService);
  const equipmentsController = createEquipmentsController(equipmentService);
  const ingredientsController = createIngredientsController(ingredientService);
  const recipesController = createRecipesController(recipeService);
  const tagController = createTagsController(tagService);
  const usersController = createUsersController(usersService);

  app.use('/admin/recipes', createAdminRecipesRouter(adminRecipesController));
  app.use('/auth', createAuthRouter(authController));
  app.use('/health', createHealthRouter(healthController));
  app.use('/categories', createCategoryRouter(categoryController));
  app.use('/equipments', createEquipmentsRouter(equipmentsController));
  app.use('/ingredients', createIngredientsRouter(ingredientsController));
  app.use('/recipes', createRecipesRouter(recipesController));
  app.use('/tags', createTagssRouter(tagController));
  app.use('/users', createUsersRouter(usersController));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
