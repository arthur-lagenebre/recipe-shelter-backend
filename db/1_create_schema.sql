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
) ENGINE=InnoDB;

CREATE TABLE Users (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  Mail VARCHAR(255) NOT NULL,
  Username VARCHAR(64) NOT NULL,
  Password VARCHAR(255) NOT NULL,
  RoleId BIGINT UNSIGNED NOT NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY users_mail_UK (Mail),
  UNIQUE KEY users_username_UK (Username),
  KEY idx_users_role_id (RoleId),
  CONSTRAINT users_role_FK
    FOREIGN KEY (RoleId) REFERENCES Roles(Id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

-- ---------- Recipes ----------
CREATE TABLE Recipes (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  UserId BIGINT UNSIGNED NOT NULL,
  Title VARCHAR(255) NOT NULL,
  Slug VARCHAR(255) NOT NULL,
  Description TEXT NOT NULL,
  PrepTimeMinutes INT NOT NULL,
  RestTimeMinutes INT NULL,
  CookTimeMinutes INT NULL,
  Servings INT NOT NULL,
  Status ENUM('draft','published') NOT NULL DEFAULT 'draft',
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PublishedAt DATETIME NULL,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY recipes_slug_UK (Slug),
  KEY idx_recipes_user_id (UserId),
  CONSTRAINT recipes_user_FK
    FOREIGN KEY (UserId) REFERENCES Users(Id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------- Recipe Categories ----------
CREATE TABLE RecipeCategories (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  Name VARCHAR(100) NOT NULL,
  Slug VARCHAR(100) NOT NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY recipe_categories_name_UK (Name),
  UNIQUE KEY recipe_categories_slug_UK (Slug)
) ENGINE=InnoDB;

CREATE TABLE RecipeCategoryLinks (
  RecipeId BIGINT UNSIGNED NOT NULL,
  CategoryId BIGINT UNSIGNED NOT NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (RecipeId, CategoryId),
  KEY idx_recipe_categorylinks_category_id (CategoryId),
  CONSTRAINT rcl_recipe_FK
    FOREIGN KEY (RecipeId) REFERENCES Recipes(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT rcl_category_FK
    FOREIGN KEY (CategoryId) REFERENCES RecipeCategories(Id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------- Ingredient catalogue ----------
CREATE TABLE IngredientCategories (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  Name VARCHAR(100) NOT NULL,
  Slug VARCHAR(100) NOT NULL,
  PRIMARY KEY (Id),
  UNIQUE KEY ingredient_categories_name_UK (Name),
  UNIQUE KEY ingredient_categories_slug_UK (Slug)
) ENGINE=InnoDB;

CREATE TABLE Ingredients (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  Name VARCHAR(255) NOT NULL,
  Slug VARCHAR(255) NOT NULL,
  CategoryId BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (Id),
  UNIQUE KEY ingredients_name_UK (Name),
  UNIQUE KEY ingredients_slug_UK (Slug),
  KEY idx_ingredients_category_id (CategoryId),
  CONSTRAINT ingredients_category_FK
    FOREIGN KEY (CategoryId) REFERENCES IngredientCategories(Id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE Equipments (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  Name VARCHAR(255) NOT NULL,
  Slug VARCHAR(255) NOT NULL,
  PRIMARY KEY (Id),
  UNIQUE KEY equipments_name_UK (Name),
  UNIQUE KEY equipments_slug_UK (Slug)
) ENGINE=InnoDB;

CREATE TABLE Tags (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  Name VARCHAR(255) NOT NULL,
  Slug VARCHAR(255) NOT NULL,
  PRIMARY KEY (Id),
  UNIQUE KEY tags_name_UK (Name),
  UNIQUE KEY tags_slug_UK (Slug)
) ENGINE=InnoDB;

-- ---------- Recipe content ----------
CREATE TABLE RecipeCoverImages (
  RecipeId BIGINT UNSIGNED NOT NULL,
  URL VARCHAR(2048) NOT NULL,
  AltText VARCHAR(255) NOT NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (RecipeId),
  CONSTRAINT recipe_cover_images_recipe_FK
    FOREIGN KEY (RecipeId) REFERENCES Recipes(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE RecipeSteps (
  RecipeId BIGINT UNSIGNED NOT NULL,
  StepNumber INT NOT NULL,
  Description TEXT NOT NULL,
  PRIMARY KEY (RecipeId, StepNumber),
  CONSTRAINT recipe_steps_recipe_FK
    FOREIGN KEY (RecipeId) REFERENCES Recipes(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE RecipeIngredients (
  RecipeId BIGINT UNSIGNED NOT NULL,
  IngredientId BIGINT UNSIGNED NOT NULL,
  Quantity DECIMAL(10,3) NOT NULL,
  Unit VARCHAR(64) NOT NULL,
  Note VARCHAR(255) NULL,
  PRIMARY KEY (RecipeId, IngredientId),
  KEY idx_recipe_ingredients_ingredient_id (IngredientId),
  CONSTRAINT recipe_ingredients_recipe_FK
    FOREIGN KEY (RecipeId) REFERENCES Recipes(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT recipe_ingredients_ingredient_FK
    FOREIGN KEY (IngredientId) REFERENCES Ingredients(Id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

CREATE TABLE Comments (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  RecipeId BIGINT UNSIGNED NOT NULL,
  UserId BIGINT UNSIGNED NOT NULL,
  ParentCommentId BIGINT UNSIGNED NULL,

  Status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  ModeratedAt DATETIME NULL,
  ModeratedByUserId BIGINT UNSIGNED NULL,

  Rating TINYINT UNSIGNED NULL,
  Comment TEXT NOT NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (Id),
  KEY idx_comments_recipe_id (RecipeId),
  KEY idx_comments_user_id (UserId),
  KEY idx_comments_parent_comment_id (ParentCommentId),
  KEY idx_comments_status (Status),

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

  CONSTRAINT comments_rating_chk
    CHECK (Rating IS NULL OR (Rating BETWEEN 1 AND 5))
) ENGINE=InnoDB;