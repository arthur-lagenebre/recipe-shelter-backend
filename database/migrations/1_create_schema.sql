USE recipe_shelter;

-- =====================================================
-- Recipe Shelter - Schema
-- =====================================================

-- ---------- Core ----------
CREATE TABLE Roles (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  Name VARCHAR(64) NOT NULL,
  PRIMARY KEY (Id),
  UNIQUE KEY roles_name_UK (Name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE Users (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  Mail VARCHAR(255) NOT NULL,
  Username VARCHAR(64) NOT NULL,
  Password VARCHAR(255) NOT NULL,
  RoleId BIGINT UNSIGNED NOT NULL,
  Status ENUM('inactive', 'active', 'banned') NOT NULL DEFAULT 'inactive',
  EmailValidatedAt DATETIME NULL,
  BannedByUserId BIGINT UNSIGNED NULL,
  BannedReason TEXT NULL,
  BannedAt DATETIME NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY users_mail_UK (Mail),
  UNIQUE KEY users_username_UK (Username),
  KEY idx_users_role_id (RoleId),
  KEY idx_users_status (Status),
  KEY idx_users_banned_by_user_id (BannedByUserId),
  CONSTRAINT users_role_FK
    FOREIGN KEY (RoleId) REFERENCES Roles(Id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT users_banned_by_user_FK
    FOREIGN KEY (BannedByUserId) REFERENCES Users(Id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE EmailValidations (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  UserId BIGINT UNSIGNED NOT NULL,
  TokenHash CHAR(64) NOT NULL,
  ExpiresAt DATETIME NOT NULL,
  UsedAt DATETIME NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY email_validations_tokenhash_UK (TokenHash),
  KEY idx_email_validations_user_id (UserId),
  CONSTRAINT email_validations_user_FK
    FOREIGN KEY (UserId) REFERENCES Users(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE PasswordResets (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  UserId BIGINT UNSIGNED NOT NULL,
  TokenHash CHAR(64) NOT NULL,
  ExpiresAt DATETIME NOT NULL,
  UsedAt DATETIME NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY password_resets_tokenhash_UK (TokenHash),
  KEY idx_password_resets_user_id (UserId),
  CONSTRAINT password_resets_user_FK
    FOREIGN KEY (UserId) REFERENCES Users(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Recipe Categories ----------
CREATE TABLE RecipeCategories (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  Name VARCHAR(100) NOT NULL,
  Slug VARCHAR(100) NOT NULL,
  IconName VARCHAR(64) NOT NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY recipe_categories_name_UK (Name),
  UNIQUE KEY recipe_categories_slug_UK (Slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Recipes ----------
CREATE TABLE Recipes (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  UserId BIGINT UNSIGNED NOT NULL,
  CategoryId BIGINT UNSIGNED NULL,
  Title VARCHAR(255) NOT NULL,
  Slug VARCHAR(255) NOT NULL,
  Description TEXT NOT NULL,
  RecipeCoverImage VARCHAR(2048) NULL,
  PrepTimeMinutes INT NOT NULL,
  RestTimeMinutes INT NULL,
  CookTimeMinutes INT NULL,
  Servings INT NOT NULL,
  Status ENUM('draft','pending','published','rejected','archived') NOT NULL DEFAULT 'draft',
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  SubmittedAt DATETIME NULL,
  ModeratedAt DATETIME NULL,
  ModeratedByUserId BIGINT UNSIGNED NULL,
  PublishedAt DATETIME NULL,
  ArchivedAt DATETIME NULL,
  RejectionReason TEXT NULL,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY recipes_slug_UK (Slug),
  KEY idx_recipes_user_id (UserId),
  KEY idx_recipes_category_id (CategoryId),
  KEY idx_recipes_status (Status),
  KEY idx_recipes_moderated_by_user_id (ModeratedByUserId),
  CONSTRAINT recipes_user_FK
    FOREIGN KEY (UserId) REFERENCES Users(Id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT recipes_category_FK
    FOREIGN KEY (CategoryId) REFERENCES RecipeCategories(Id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT recipes_moderated_by_user_FK
    FOREIGN KEY (ModeratedByUserId) REFERENCES Users(Id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Ingredient catalogue ----------
CREATE TABLE Ingredients (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  Name VARCHAR(255) NOT NULL,
  Slug VARCHAR(255) NOT NULL,
  PRIMARY KEY (Id),
  UNIQUE KEY ingredients_name_UK (Name),
  UNIQUE KEY ingredients_slug_UK (Slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Equipment catalogue ----------
CREATE TABLE Equipments (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  Name VARCHAR(255) NOT NULL,
  Slug VARCHAR(255) NOT NULL,
  PRIMARY KEY (Id),
  UNIQUE KEY equipments_name_UK (Name),
  UNIQUE KEY equipments_slug_UK (Slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Tag catalogue ----------
CREATE TABLE Tags (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  Name VARCHAR(255) NOT NULL,
  Slug VARCHAR(255) NOT NULL,
  PRIMARY KEY (Id),
  UNIQUE KEY tags_name_UK (Name),
  UNIQUE KEY tags_slug_UK (Slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Recipe content ----------
CREATE TABLE RecipeSteps (
  RecipeId BIGINT UNSIGNED NOT NULL,
  StepNumber INT NOT NULL,
  Description TEXT NOT NULL,
  PRIMARY KEY (RecipeId, StepNumber),
  CONSTRAINT recipe_steps_recipe_FK
    FOREIGN KEY (RecipeId) REFERENCES Recipes(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE RecipeIngredients (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  RecipeId BIGINT UNSIGNED NOT NULL,
  IngredientId BIGINT UNSIGNED NOT NULL,
  Quantity DECIMAL(10,3) NOT NULL,
  Unit VARCHAR(64) NULL,
  Note VARCHAR(255) NULL,
  SortOrder INT NOT NULL DEFAULT 1,
  PRIMARY KEY (Id),
  KEY idx_recipe_ingredients_recipe_sort (RecipeId, SortOrder),
  KEY idx_recipe_ingredients_ingredient_id (IngredientId),
  CONSTRAINT recipe_ingredients_recipe_FK
    FOREIGN KEY (RecipeId) REFERENCES Recipes(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT recipe_ingredients_ingredient_FK
    FOREIGN KEY (IngredientId) REFERENCES Ingredients(Id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE RecipeTags (
  RecipeId BIGINT UNSIGNED NOT NULL,
  TagId BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (RecipeId, TagId),
  KEY idx_recipe_tags_tag_id (TagId),
  CONSTRAINT recipe_tags_recipe_FK
    FOREIGN KEY (RecipeId) REFERENCES Recipes(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT recipe_tags_tag_FK
    FOREIGN KEY (TagId) REFERENCES Tags(Id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE RecipeEquipments (
  RecipeId BIGINT UNSIGNED NOT NULL,
  EquipmentId BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (RecipeId, EquipmentId),
  KEY idx_recipe_equipments_equipment_id (EquipmentId),
  CONSTRAINT recipe_equipment_recipe_FK
    FOREIGN KEY (RecipeId) REFERENCES Recipes(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT recipe_equipements_equipment_FK
    FOREIGN KEY (EquipmentId) REFERENCES Equipments(Id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Social ----------
CREATE TABLE Favorites (
  UserId BIGINT UNSIGNED NOT NULL,
  RecipeId BIGINT UNSIGNED NOT NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (UserId, RecipeId),
  KEY idx_favorites_recipe_id (RecipeId),
  CONSTRAINT favorites_user_FK
    FOREIGN KEY (UserId) REFERENCES Users(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT favorites_recipe_FK
    FOREIGN KEY (RecipeId) REFERENCES Recipes(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE Comments (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  RecipeId BIGINT UNSIGNED NOT NULL,
  UserId BIGINT UNSIGNED NOT NULL,
  ParentCommentId BIGINT UNSIGNED NULL,
  ModeratedAt DATETIME NULL,
  ModeratedByUserId BIGINT UNSIGNED NULL,
  DeletedAt DATETIME NULL,
  DeletedByUserId BIGINT UNSIGNED NULL,
  Rating TINYINT UNSIGNED NULL,
  Comment TEXT NOT NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  KEY idx_comments_recipe_id (RecipeId),
  KEY idx_comments_user_id (UserId),
  KEY idx_comments_parent_comment_id (ParentCommentId),
  KEY idx_comments_deleted_at (DeletedAt),
  CONSTRAINT comments_recipe_FK
    FOREIGN KEY (RecipeId) REFERENCES Recipes(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT comments_user_FK
    FOREIGN KEY (UserId) REFERENCES Users(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT comments_parent_FK
    FOREIGN KEY (ParentCommentId) REFERENCES Comments(Id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT comments_moderated_by_FK
    FOREIGN KEY (ModeratedByUserId) REFERENCES Users(Id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT comments_deleted_by_FK
    FOREIGN KEY (DeletedByUserId) REFERENCES Users(Id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,

  CONSTRAINT comments_rating_chk
    CHECK (Rating IS NULL OR (Rating BETWEEN 1 AND 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
