import cors from 'cors';
import express from 'express';

import { createAuthController } from './api/auth/auth.controller.js';
import { createAuthRouter } from './api/auth/auth.routes.js';
import { createEquipmentsContoller } from './api/equipments/equipments.controller.js';
import { createEquipmentsRouter } from './api/equipments/equipments.routes.js';
import { healthController } from './api/health/health.controller.js';
import { createHealthRouter } from './api/health/health.routes.js';
import { createIngredientsController } from './api/ingredients/ingredients.controller.js';
import { createIngredientsRouter } from './api/ingredients/ingredients.routes.js';
import { createRecipesController } from './api/recipes/recipes.controller.js';
import { createRecipesRouter } from './api/recipes/recipes.routes.js';
import { createUsersController } from './api/users/users.controller.js';
import { createUsersRouter } from './api/users/users.routes.js';
import { pool } from './db/pool.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { PasswordResetRepositoryMysql } from './repositories/auth/password-reset.repository.mysql.js';
import { EquipmentRepositoryMysql } from './repositories/equipments/equipment-repository.mysql.js';
import { IngredientRepositoryMysql } from './repositories/ingredients/ingredient-repository.mysql.js';
import { RecipeRepositoryMysql } from './repositories/recipes/recipe.repository.mysql.js';
import { UserRepositoryMysql } from './repositories/users/user-repository.mysql.js';
import { AuthService } from './services/auth/auth.service.js';
import { PasswordResetService } from './services/auth/password-reset.service.js';
import { EquipmentService } from './services/equipments/equipments.service.js';
import { IngredientService } from './services/ingredients/ingredients.service.js';
import { ConsoleMailer } from './services/mail/console.mailer.js';
import { RecipeSlugService } from './services/recipes/recipe-slug.service.js';
import { RecipeService } from './services/recipes/recipes.services.js';
import { UserService } from './services/users/users.service.js';
import { env } from './utils/env.js';

export function createApp() {
  const app = express();

  const origins = env.http.corsAllowedOrigins.split(',');

  app.use(cors({ origin: origins }));
  app.use(express.json());

  const userRepository = new UserRepositoryMysql(pool);
  const passwordResetRepository = new PasswordResetRepositoryMysql(pool);
  const equipmentRepository = new EquipmentRepositoryMysql(pool);
  const ingredientRepository = new IngredientRepositoryMysql(pool);
  const recipeRepository = new RecipeRepositoryMysql(pool);
  const mailer = new ConsoleMailer();

  const authService = new AuthService(userRepository);
  const recipeSlugService = new RecipeSlugService(recipeRepository);
  const equipmentService = new EquipmentService(equipmentRepository);
  const ingredientService = new IngredientService(ingredientRepository);
  const recipeService = new RecipeService(recipeRepository, recipeSlugService);
  const usersService = new UserService(userRepository);
  const passwordResetService = new PasswordResetService(userRepository, passwordResetRepository, mailer, env.http.frontendBaseUrl);
  const authController = createAuthController(authService, passwordResetService);
  const recipesController = createRecipesController(recipeService);
  const equipmentsController = createEquipmentsContoller(equipmentService);
  const ingredientsController = createIngredientsController(ingredientService);
  const usersController = createUsersController(usersService);

  app.use('/auth', createAuthRouter(authController));
  app.use('/health', createHealthRouter(healthController));
  app.use('/equipments', createEquipmentsRouter(equipmentsController));
  app.use('/ingredients', createIngredientsRouter(ingredientsController));
  app.use('/recipes', createRecipesRouter(recipesController));
  app.use('/users', createUsersRouter(usersController));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
