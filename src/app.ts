import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';

import { createAdminAuditLogsController } from './api/admin/admin.audit-logs.controller.js';
import { createAdminAuditLogsRouter } from './api/admin/admin.audit-logs.routes.js';
import { adminAuthorizationPolicies } from './api/admin/admin.authorization.js';
import { createAdminCatalogProposalsController } from './api/admin/admin.catalog-proposals.controller.js';
import { createAdminCatalogProposalsRouter } from './api/admin/admin.catalog-proposals.routes.js';
import { createAdminCommentsController } from './api/admin/admin.comments.controller.js';
import { createAdminCommentsRouter } from './api/admin/admin.comments.routes.js';
import { createAdminIngredientsController } from './api/admin/admin.ingredients.controller.js';
import { createAdminIngredientsRouter } from './api/admin/admin.ingredients.routes.js';
import { createAdminRecipesController } from './api/admin/admin.recipes.controller.js';
import { createAdminRecipesRouter } from './api/admin/admin.recipes.routes.js';
import { createStaffInvitationsController } from './api/admin/admin.staff-invitations.controller.js';
import { createStaffInvitationsRouter } from './api/admin/admin.staff-invitations.routes.js';
import { createStaffSessionsController } from './api/admin/admin.staff-sessions.controller.js';
import { createAdminStaffSessionsRouter } from './api/admin/admin.staff-sessions.routes.js';
import { createAdminStaffController } from './api/admin/admin.staff.controller.js';
import { createAdminStaffRouter } from './api/admin/admin.staff.routes.js';
import { createAdminTagsController } from './api/admin/admin.tags.controller.js';
import { createAdminTagsRouter } from './api/admin/admin.tags.routes.js';
import { createAdminUsersController } from './api/admin/admin.users.controller.js';
import { createAdminUsersRouter } from './api/admin/admin.users.routes.js';
import { createAuthController } from './api/auth/auth.controller.js';
import { createAuthRouter, createStaffAuthRouter, createStaffInvitationActivationRouter } from './api/auth/auth.routes.js';
import { createCatalogProposalsController } from './api/catalog/catalog-proposals.controller.js';
import { createCatalogProposalsRouter } from './api/catalog/catalog-proposals.routes.js';
import { createCategoryController } from './api/categories/categories.controller.js';
import { createCategoryRouter } from './api/categories/categories.routes.js';
import { createCommentsController } from './api/comments/comments.controller.js';
import { createCommentsRouter, createRecipeCommentsRouter } from './api/comments/comments.routes.js';
import { createContactController } from './api/contact/contact.controller.js';
import { createContactRouter } from './api/contact/contact.routes.js';
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
import { createTagsController } from './api/tags/tags.controller.js';
import { createTagsRouter } from './api/tags/tags.routes.js';
import { createUsersController } from './api/users/users.controller.js';
import { createUsersRouter } from './api/users/users.routes.js';
import { pool } from './db/pool.js';
import { EnforceAuthorizationPolicies } from './middlewares/authorization.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import {
    configureAuthRbacRepository,
    configureAuthSessionRepository,
    configureAuthUserRepository,
    requireStaffAuth
} from './middlewares/require-auth.js';
import { AdminAuditQueryRepositoryMysql } from './repositories/admin/admin.audit-query.repository.mysql.js';
import { AdminAuditRepositoryMysql } from './repositories/admin/admin.audit.repository.mysql.js';
import { AdminCommentRepositoryMysql } from './repositories/admin/admin.comments.repository.mysql.js';
import { AdminIngredientRepositoryMysql } from './repositories/admin/admin.ingredients.repository.mysql.js';
import { AdminRecipeRepositoryMysql } from './repositories/admin/admin.recipe.repository.mysql.js';
import { StaffInvitationRepositoryMysql } from './repositories/admin/admin.staff-invitation.repository.mysql.js';
import { AdminStaffRepositoryMysql } from './repositories/admin/admin.staff.repository.mysql.js';
import { AdminTagRepositoryMysql } from './repositories/admin/admin.tags.repository.mysql.js';
import { AdminUserRepositoryMysql } from './repositories/admin/admin.users.repository.mysql.js';
import { EmailValidationRepositoryMysql } from './repositories/auth/email-validation.repository.mysql.js';
import { PasswordResetRepositoryMysql } from './repositories/auth/password-reset.repository.mysql.js';
import { SessionRepositoryMysql } from './repositories/auth/session.repository.mysql.js';
import { StaffMfaRepositoryMysql } from './repositories/auth/staff-mfa.repository.mysql.js';
import { CatalogProposalRepositoryMysql } from './repositories/catalog/catalog-proposals.repository.mysql.js';
import { CategoryRepositoryMysql } from './repositories/category/category.repository.mysql.js';
import { CommentRepositoryMysql } from './repositories/comment/comment.repository.mysql.js';
import { EquipmentRepositoryMysql } from './repositories/equipments/equipment.repository.mysql.js';
import { FavoriteRepositoryMysql } from './repositories/favorite/favorite.repository.mysql.js';
import { IngredientRepositoryMysql } from './repositories/ingredients/ingredient.repository.mysql.js';
import { RbacRepositoryMysql } from './repositories/rbac/rbac.repository.mysql.js';
import { RecipeImageRepositoryMysql } from './repositories/recipe-images/recipe-image.repository.mysql.js';
import { RecipeRepositoryMysql } from './repositories/recipes/recipe.repository.mysql.js';
import { TagRepositoryMysql } from './repositories/tag/tag.repository.mysql.js';
import { UserRepositoryMysql } from './repositories/users/user.repository.mysql.js';
import { AdminAuditActionRunnerMysql } from './services/admin/admin.audit-action.runner.js';
import { AdminAuditQueryService } from './services/admin/admin.audit-query.service.js';
import { AdminAuditService } from './services/admin/admin.audit.service.js';
import { AdminCatalogProposalService } from './services/admin/admin.catalog-proposals.service.js';
import { AdminCommentService } from './services/admin/admin.comments.service.js';
import { AdminIngredientService } from './services/admin/admin.ingredients.service.js';
import { AdminRecipeService } from './services/admin/admin.recipes.service.js';
import { StaffInvitationService } from './services/admin/admin.staff-invitation.service.js';
import { AdminStaffService } from './services/admin/admin.staff.service.js';
import { AdminTagService } from './services/admin/admin.tags.service.js';
import { AdminUserService } from './services/admin/admin.users.service.js';
import { AuthService } from './services/auth/auth.service.js';
import { EmailValidationService } from './services/auth/email-validation.service.js';
import { PasswordResetService } from './services/auth/password-reset.service.js';
import { StaffMfaService } from './services/auth/staff-mfa.service.js';
import { StaffSessionService } from './services/auth/staff-session.service.js';
import { CatalogProposalService } from './services/catalog/catalog-proposals.service.js';
import { CategoryService } from './services/categories/categories.service.js';
import { CommentService } from './services/comments/comments.service.js';
import { ContactService } from './services/contact/contact.service.js';
import { EquipmentService } from './services/equipments/equipments.service.js';
import { FavoriteService } from './services/favorites/favorites.service.js';
import { IngredientService } from './services/ingredients/ingredients.service.js';
import { SmtpMailService } from './services/mail/mail.service.js';
import { RecipeImageProcessor } from './services/recipes/recipe-image.processor.js';
import { RecipeImageService } from './services/recipes/recipe-image.service.js';
import { RecipeSlugService } from './services/recipes/recipe-slug.service.js';
import { RecipeService } from './services/recipes/recipes.service.js';
import { TagService } from './services/tags/tags.service.js';
import { UserService } from './services/users/users.service.js';
import { createImageStorage } from './storage/image-storage.factory.js';
import { createLocalMediaMiddleware } from './storage/local-media.middleware.js';
import { env } from './utils/env.js';

import type { SessionRepository } from './repositories/auth/session.repository.interface.js';
import type { RbacRepository } from './repositories/rbac/rbac.repository.interface.js';
import type { UserRepository } from './repositories/users/user.repository.interface.js';
import type { ImageStorage } from './storage/image-storage.interface.js';

export type AppDependencies = {
    adminAuditQueryService: AdminAuditQueryService;
    adminCatalogProposalService: AdminCatalogProposalService;
    adminCommentService: AdminCommentService;
    adminIngredientService: AdminIngredientService;
    adminRecipeService: AdminRecipeService;
    adminStaffService: AdminStaffService;
    adminTagService: AdminTagService;
    adminUserService: AdminUserService;
    authService: AuthService;
    authRbacRepository: RbacRepository;
    authSessionRepository: SessionRepository;
    authUserRepository: Pick<UserRepository, 'findById'>;
    categoryService: CategoryService;
    catalogProposalService: CatalogProposalService;
    commentService: CommentService;
    contactService: ContactService;
    emailValidationService: EmailValidationService;
    equipmentService: EquipmentService;
    favoriteService: FavoriteService;
    ingredientService: IngredientService;
    imageStorage: ImageStorage;
    passwordResetService: PasswordResetService;
    recipeImageService: RecipeImageService;
    recipeService: RecipeService;
    staffInvitationService: StaffInvitationService;
    staffSessionService: StaffSessionService;
    tagService: TagService;
    usersService: UserService;
};

function createDefaultDependencies(): AppDependencies {
    const mailer = new SmtpMailService(env.smtp);
    const imageStorage = createImageStorage(env.imageStorage);
    const getPublicImageUrl = (key: string) => imageStorage.getPublicUrl(key);

    const adminAuditQueryRepository = new AdminAuditQueryRepositoryMysql(pool);
    const adminCommentRepository = new AdminCommentRepositoryMysql(pool);
    const adminIngredientRepository = new AdminIngredientRepositoryMysql(pool);
    const adminRecipeRepository = new AdminRecipeRepositoryMysql(pool, getPublicImageUrl);
    const adminStaffRepository = new AdminStaffRepositoryMysql(pool);
    const adminTagRepository = new AdminTagRepositoryMysql(pool);
    const adminUserRepository = new AdminUserRepositoryMysql(pool);
    const staffInvitationRepository = new StaffInvitationRepositoryMysql(pool);
    const adminAuditActions = new AdminAuditActionRunnerMysql(pool, (db) => new AdminAuditService(new AdminAuditRepositoryMysql(db)));
    const categoryRepository = new CategoryRepositoryMysql(pool);
    const catalogProposalRepository = new CatalogProposalRepositoryMysql(pool);
    const commentRepository = new CommentRepositoryMysql(pool);
    const equipmentRepository = new EquipmentRepositoryMysql(pool);
    const favoriteRepository = new FavoriteRepositoryMysql(pool, getPublicImageUrl);
    const ingredientRepository = new IngredientRepositoryMysql(pool);
    const emailValidationRepository = new EmailValidationRepositoryMysql(pool);
    const passwordResetRepository = new PasswordResetRepositoryMysql(pool);
    const sessionRepository = new SessionRepositoryMysql(pool);
    const staffMfaRepository = new StaffMfaRepositoryMysql(pool);
    const recipeRepository = new RecipeRepositoryMysql(pool, getPublicImageUrl);
    const recipeImageRepository = new RecipeImageRepositoryMysql(pool);
    const rbacRepository = new RbacRepositoryMysql(pool);
    const tagRepository = new TagRepositoryMysql(pool);
    const userRepository = new UserRepositoryMysql(pool);

    const emailValidationService = new EmailValidationService(userRepository, emailValidationRepository, mailer, env.http.frontendBaseUrl);
    const staffMfaService = new StaffMfaService(staffMfaRepository);
    const recipeSlugService = new RecipeSlugService(recipeRepository);
    const recipeImageService = new RecipeImageService(recipeRepository, recipeImageRepository, new RecipeImageProcessor(), imageStorage);

    return {
        adminAuditQueryService: new AdminAuditQueryService(adminAuditQueryRepository),
        adminCatalogProposalService: new AdminCatalogProposalService(
            catalogProposalRepository,
            adminTagRepository,
            adminIngredientRepository,
            equipmentRepository,
            adminAuditActions
        ),
        adminCommentService: new AdminCommentService(adminCommentRepository, adminAuditActions),
        adminIngredientService: new AdminIngredientService(adminIngredientRepository, adminAuditActions),
        adminRecipeService: new AdminRecipeService(adminRecipeRepository, adminAuditActions, recipeImageService),
        adminStaffService: new AdminStaffService(adminStaffRepository, adminAuditActions),
        adminTagService: new AdminTagService(adminTagRepository, adminAuditActions),
        adminUserService: new AdminUserService(userRepository, adminUserRepository, adminAuditActions),
        authService: new AuthService(userRepository, emailValidationService, sessionRepository, staffMfaService),
        authRbacRepository: rbacRepository,
        authSessionRepository: sessionRepository,
        authUserRepository: userRepository,
        categoryService: new CategoryService(categoryRepository),
        catalogProposalService: new CatalogProposalService(catalogProposalRepository),
        commentService: new CommentService(commentRepository),
        contactService: new ContactService(mailer),
        emailValidationService,
        equipmentService: new EquipmentService(equipmentRepository),
        favoriteService: new FavoriteService(favoriteRepository, recipeRepository),
        imageStorage,
        ingredientService: new IngredientService(ingredientRepository),
        passwordResetService: new PasswordResetService(
            userRepository,
            passwordResetRepository,
            sessionRepository,
            mailer,
            env.http.frontendBaseUrl
        ),
        recipeImageService,
        recipeService: new RecipeService(recipeRepository, recipeSlugService),
        staffInvitationService: new StaffInvitationService(staffInvitationRepository, mailer, adminAuditActions, env.http.frontendBaseUrl),
        staffSessionService: new StaffSessionService(sessionRepository, userRepository, adminAuditActions),
        tagService: new TagService(tagRepository),
        usersService: new UserService(userRepository, recipeRepository, sessionRepository)
    };
}

export function createApp(overrides: Partial<AppDependencies> = {}) {
    const app = express();
    const dependencies = { ...createDefaultDependencies(), ...overrides };

    const origins = env.http.corsAllowedOrigins
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    if (origins.includes('*')) throw new Error('CORS_ALLOWED_ORIGINS must list explicit origins when credentials are enabled');

    app.use(cors({ credentials: true, origin: origins }));
    app.use(cookieParser());

    const localMediaMiddleware = createLocalMediaMiddleware(dependencies.imageStorage);
    if (localMediaMiddleware) app.use('/media', localMediaMiddleware);

    app.use(express.json());

    configureAuthUserRepository(dependencies.authUserRepository);
    configureAuthRbacRepository(dependencies.authRbacRepository);
    configureAuthSessionRepository(dependencies.authSessionRepository);

    const adminAuditLogsController = createAdminAuditLogsController(dependencies.adminAuditQueryService);
    const adminCatalogProposalsController = createAdminCatalogProposalsController(dependencies.adminCatalogProposalService);
    const adminCommentsController = createAdminCommentsController(dependencies.adminCommentService);
    const adminIngredientsController = createAdminIngredientsController(dependencies.adminIngredientService);
    const adminRecipesController = createAdminRecipesController(dependencies.adminRecipeService);
    const adminStaffController = createAdminStaffController(dependencies.adminStaffService);
    const adminTagsController = createAdminTagsController(dependencies.adminTagService);
    const adminUsersController = createAdminUsersController(dependencies.adminUserService);
    const authController = createAuthController(
        dependencies.authService,
        dependencies.passwordResetService,
        dependencies.emailValidationService
    );
    const staffInvitationsController = createStaffInvitationsController(dependencies.staffInvitationService);
    const staffSessionsController = createStaffSessionsController(dependencies.staffSessionService);
    const categoryController = createCategoryController(dependencies.categoryService);
    const catalogProposalsController = createCatalogProposalsController(dependencies.catalogProposalService);
    const commentsController = createCommentsController(dependencies.commentService);
    const contactController = createContactController(dependencies.contactService);
    const equipmentsController = createEquipmentsController(dependencies.equipmentService);
    const favoritesController = createFavoritesController(dependencies.favoriteService);
    const ingredientsController = createIngredientsController(dependencies.ingredientService);
    const recipesController = createRecipesController(dependencies.recipeService, dependencies.recipeImageService);
    const tagController = createTagsController(dependencies.tagService);
    const usersController = createUsersController(dependencies.usersService);

    const adminRouter = express.Router();
    adminRouter.use('/auth', createStaffAuthRouter(authController, staffSessionsController));
    adminRouter.use(requireStaffAuth, EnforceAuthorizationPolicies(adminAuthorizationPolicies));
    adminRouter.use('/audit-logs', createAdminAuditLogsRouter(adminAuditLogsController));
    adminRouter.use('/catalog-proposals', createAdminCatalogProposalsRouter(adminCatalogProposalsController));
    adminRouter.use('/comments', createAdminCommentsRouter(adminCommentsController));
    adminRouter.use('/ingredients', createAdminIngredientsRouter(adminIngredientsController));
    adminRouter.use('/recipes', createAdminRecipesRouter(adminRecipesController));
    adminRouter.use('/staff/invitations', createStaffInvitationsRouter(staffInvitationsController));
    adminRouter.use('/staff', createAdminStaffRouter(adminStaffController));
    adminRouter.use('/staff', createAdminStaffSessionsRouter(staffSessionsController));
    adminRouter.use('/tags', createAdminTagsRouter(adminTagsController));
    adminRouter.use('/users', createAdminUsersRouter(adminUsersController));

    app.use('/api/v1/admin', adminRouter);
    app.use('/api/v1/auth', createAuthRouter(authController));
    app.use('/api/v1/staff/invitations', createStaffInvitationActivationRouter(authController));
    app.use('/api/v1/categories', createCategoryRouter(categoryController));
    app.use('/api/v1/catalog', createCatalogProposalsRouter(catalogProposalsController));
    app.use('/api/v1/comments', createCommentsRouter(commentsController));
    app.use('/api/v1/contact', createContactRouter(contactController));
    app.use('/api/v1/equipments', createEquipmentsRouter(equipmentsController));
    app.use('/api/v1/favorites', createFavoritesRouter(favoritesController));
    app.use('/api/v1/health', createHealthRouter(healthController));
    app.use('/api/v1/ingredients', createIngredientsRouter(ingredientsController));
    app.use('/api/v1/recipes/:recipeId/comments', createRecipeCommentsRouter(commentsController));
    app.use('/api/v1/recipes', createRecipesRouter(recipesController));
    app.use('/api/v1/tags', createTagsRouter(tagController));
    app.use('/api/v1/users', createUsersRouter(usersController));

    app.use(notFound);
    app.use(errorHandler);

    return app;
}
