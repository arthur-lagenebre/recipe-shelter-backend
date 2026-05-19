import cors from 'cors';
import express from 'express';

import { createAdminCommentsController } from './api/admin/admin.comments.controller.js';
import { createAdminCommentsRouter } from './api/admin/admin.comments.routes.js';
import { createAdminRecipesController } from './api/admin/admin.recipes.controller.js';
import { createAdminRecipesRouter } from './api/admin/admin.recipes.routes.js';
import { createAdminUsersController } from './api/admin/admin.users.controller.js';
import { createAdminUsersRouter } from './api/admin/admin.users.routes.js';
import { createAuthController } from './api/auth/auth.controller.js';
import { createAuthRouter } from './api/auth/auth.routes.js';
import { createCategoryController } from './api/category/category.controller.js';
import { createCategoryRouter } from './api/category/category.routes.js';
import { createCommentsController } from './api/comments/comments.controller.js';
import { createCommentsRouter, createRecipeCommentsRouter } from './api/comments/comments.routes.js';
import { createContactController } from './api/contact/contact.controller.js';
import { createContactRouter } from './api/contact/contact.router.js';
import { createEquipmentsController } from './api/equipments/equipments.controller.js';
import { createEquipmentsRouter } from './api/equipments/equipments.routes.js';
import { createFavoritesController } from './api/favorites/favorites.controller.js';
import { createFavoritesRouter } from './api/favorites/favorites.routes.js';
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
import { configureAuthUserRepository } from './middlewares/require-auth.js';
import { AdminCommentRepositoryMysql } from './repositories/admin/admin.comments.repository.mysql.js';
import { AdminRecipeRepositoryMysql } from './repositories/admin/admin.recipe.repository.mysql.js';
import { AdminUserRepositoryMysql } from './repositories/admin/admin.users.repository.mysql.js';
import { EmailValidationRepositoryMysql } from './repositories/auth/email-validation.repository.mysql.js';
import { PasswordResetRepositoryMysql } from './repositories/auth/password-reset.repository.mysql.js';
import { CategoryRepositoryMysql } from './repositories/category/category.repository.mysql.js';
import { CommentRepositoryMysql } from './repositories/comments/comments.repository.mysql.js';
import { EquipmentRepositoryMysql } from './repositories/equipments/equipment.repository.mysql.js';
import { FavoriteRepositoryMysql } from './repositories/favorites/favorites.repository.mysql.js';
import { IngredientRepositoryMysql } from './repositories/ingredients/ingredient.repository.mysql.js';
import { RecipeRepositoryMysql } from './repositories/recipes/recipe.repository.mysql.js';
import { TagRepositoryMysql } from './repositories/tag/tag.repository.mysql.js';
import { UserRepositoryMysql } from './repositories/users/user.repository.mysql.js';
import { AdminCommentService } from './services/admin/admin.comments.services.js';
import { AdminRecipeService } from './services/admin/admin.recipes.services.js';
import { AdminUserService } from './services/admin/admin.users.service.js';
import { AuthService } from './services/auth/auth.service.js';
import { EmailValidationService } from './services/auth/email-validation.service.js';
import { PasswordResetService } from './services/auth/password-reset.service.js';
import { CategoryService } from './services/category/category.service.js';
import { CommentService } from './services/comments/comments.service.js';
import { ContactService } from './services/contact/contact.service.js';
import { EquipmentService } from './services/equipments/equipments.service.js';
import { FavoriteService } from './services/favorites/favorites.service.js';
import { IngredientService } from './services/ingredients/ingredients.service.js';
import { SmtpMailService } from './services/mail/mail.service.js';
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

  const mailer = new SmtpMailService(env.smtp);

  const adminCommentRepository = new AdminCommentRepositoryMysql(pool);
  const adminRecipeRepository = new AdminRecipeRepositoryMysql(pool);
  const adminUserRepository = new AdminUserRepositoryMysql(pool);
  const categoryRepository = new CategoryRepositoryMysql(pool);
  const commentRepository = new CommentRepositoryMysql(pool);
  const equipmentRepository = new EquipmentRepositoryMysql(pool);
  const favoriteRepository = new FavoriteRepositoryMysql(pool);
  const ingredientRepository = new IngredientRepositoryMysql(pool);
  const emailValidationRepository = new EmailValidationRepositoryMysql(pool);
  const passwordResetRepository = new PasswordResetRepositoryMysql(pool);
  const recipeRepository = new RecipeRepositoryMysql(pool);
  const tagRepository = new TagRepositoryMysql(pool);
  const userRepository = new UserRepositoryMysql(pool);

  configureAuthUserRepository(userRepository);

  const adminCommentService = new AdminCommentService(adminCommentRepository);
  const adminRecipeService = new AdminRecipeService(recipeRepository, adminRecipeRepository);
  const adminUserService = new AdminUserService(userRepository, adminUserRepository);
  const emailValidationService = new EmailValidationService(userRepository, emailValidationRepository, mailer, env.http.frontendBaseUrl);
  const authService = new AuthService(userRepository, emailValidationService);
  const categoryService = new CategoryService(categoryRepository);
  const commentService = new CommentService(commentRepository);
  const contactService = new ContactService(mailer);
  const equipmentService = new EquipmentService(equipmentRepository);
  const favoriteService = new FavoriteService(favoriteRepository);
  const ingredientService = new IngredientService(ingredientRepository);
  const passwordResetService = new PasswordResetService(userRepository, passwordResetRepository, mailer, env.http.frontendBaseUrl);
  const recipeSlugService = new RecipeSlugService(recipeRepository);
  const recipeService = new RecipeService(recipeRepository, recipeSlugService);
  const tagService = new TagService(tagRepository);
  const usersService = new UserService(userRepository, recipeRepository);

  const adminCommentsController = createAdminCommentsController(adminCommentService);
  const adminRecipesController = createAdminRecipesController(adminRecipeService);
  const adminUsersController = createAdminUsersController(adminUserService);
  const authController = createAuthController(authService, passwordResetService, emailValidationService);
  const categoryController = createCategoryController(categoryService);
  const commentsController = createCommentsController(commentService);
  const contactController = createContactController(contactService);
  const equipmentsController = createEquipmentsController(equipmentService);
  const favoritesController = createFavoritesController(favoriteService);
  const ingredientsController = createIngredientsController(ingredientService);
  const recipesController = createRecipesController(recipeService);
  const tagController = createTagsController(tagService);
  const usersController = createUsersController(usersService);

  app.use('/api/v1/admin/comments', createAdminCommentsRouter(adminCommentsController));
  app.use('/api/v1/admin/recipes', createAdminRecipesRouter(adminRecipesController));
  app.use('/api/v1/admin/users', createAdminUsersRouter(adminUsersController));
  app.use('/api/v1/auth', createAuthRouter(authController));
  app.use('/api/v1/categories', createCategoryRouter(categoryController));
  app.use('/api/v1/comments', createCommentsRouter(commentsController));
  app.use('/api/v1/contact', createContactRouter(contactController));
  app.use('/api/v1/equipments', createEquipmentsRouter(equipmentsController));
  app.use('/api/v1/favorites', createFavoritesRouter(favoritesController));
  app.use('/api/v1/health', createHealthRouter(healthController));
  app.use('/api/v1/ingredients', createIngredientsRouter(ingredientsController));
  app.use('/api/v1/recipes/:recipeId/comments', createRecipeCommentsRouter(commentsController));
  app.use('/api/v1/recipes', createRecipesRouter(recipesController));
  app.use('/api/v1/tags', createTagssRouter(tagController));
  app.use('/api/v1/users', createUsersRouter(usersController));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
