USE recipe_shelter;

-- =====================================================
-- Recipe Shelter - Schema
-- =====================================================

-- ---------- Core ----------
CREATE TABLE Roles (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  Code VARCHAR(64) NOT NULL,
  Name VARCHAR(64) NOT NULL,
  Description VARCHAR(255) NOT NULL,
  PRIMARY KEY (Id),
  UNIQUE KEY roles_code_UK (Code),
  UNIQUE KEY roles_name_UK (Name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE Permissions (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  Code VARCHAR(128) NOT NULL,
  Description VARCHAR(255) NOT NULL,
  PRIMARY KEY (Id),
  UNIQUE KEY permissions_code_UK (Code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE RolePermissions (
  RoleId BIGINT UNSIGNED NOT NULL,
  PermissionId BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (RoleId, PermissionId),
  KEY idx_role_permissions_permission_id (PermissionId),
  CONSTRAINT role_permissions_role_FK
    FOREIGN KEY (RoleId) REFERENCES Roles(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT role_permissions_permission_FK
    FOREIGN KEY (PermissionId) REFERENCES Permissions(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE Users (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  Mail VARCHAR(255) NOT NULL,
  Username VARCHAR(64) NOT NULL,
  Password VARCHAR(255) NULL,
  AccountType ENUM('community', 'staff') NOT NULL DEFAULT 'community',
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
  UNIQUE KEY users_id_account_type_UK (Id, AccountType),
  KEY idx_users_status (Status),
  KEY idx_users_banned_by_user_id (BannedByUserId),
  CONSTRAINT users_community_password_CK
    CHECK (AccountType <> 'community' OR Password IS NOT NULL),
  CONSTRAINT users_active_staff_password_CK
    CHECK (AccountType <> 'staff' OR Status <> 'active' OR Password IS NOT NULL),
  CONSTRAINT users_banned_by_user_FK
    FOREIGN KEY (BannedByUserId) REFERENCES Users(Id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE StaffProfiles (
  UserId BIGINT UNSIGNED NOT NULL,
  AccountType ENUM('community', 'staff') NOT NULL DEFAULT 'staff',
  Status ENUM('invited', 'active', 'locked', 'disabled') NOT NULL DEFAULT 'invited',
  MfaEnrolledAt DATETIME NULL,
  DisabledByStaffUserId BIGINT UNSIGNED NULL,
  DisabledReason TEXT NULL,
  DisabledAt DATETIME NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (UserId),
  KEY idx_staff_profiles_status (Status),
  KEY idx_staff_profiles_disabled_by_staff_user_id (DisabledByStaffUserId),
  CONSTRAINT staff_profiles_account_type_CK CHECK (AccountType = 'staff'),
  CONSTRAINT staff_profiles_active_mfa_CK
    CHECK (Status <> 'active' OR MfaEnrolledAt IS NOT NULL),
  CONSTRAINT staff_profiles_disablement_CK
    CHECK (
      (Status = 'disabled'
        AND DisabledByStaffUserId IS NOT NULL
        AND DisabledReason IS NOT NULL
        AND CHAR_LENGTH(TRIM(DisabledReason)) > 0
        AND CHAR_LENGTH(DisabledReason) <= 1000
        AND DisabledAt IS NOT NULL
        AND DisabledAt >= CreatedAt)
      OR (Status <> 'disabled'
        AND DisabledByStaffUserId IS NULL
        AND DisabledReason IS NULL
        AND DisabledAt IS NULL)
    ),
  CONSTRAINT staff_profiles_user_account_type_FK
    FOREIGN KEY (UserId, AccountType) REFERENCES Users(Id, AccountType)
    ON UPDATE RESTRICT
    ON DELETE CASCADE,
  CONSTRAINT staff_profiles_disabled_by_staff_profile_FK
    FOREIGN KEY (DisabledByStaffUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE StaffRoles (
  StaffUserId BIGINT UNSIGNED NOT NULL,
  RoleId BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (StaffUserId, RoleId),
  KEY idx_staff_roles_role_id (RoleId),
  CONSTRAINT staff_roles_staff_profile_FK
    FOREIGN KEY (StaffUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT staff_roles_role_FK
    FOREIGN KEY (RoleId) REFERENCES Roles(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE StaffInvitations (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  StaffUserId BIGINT UNSIGNED NOT NULL,
  CreatedByStaffUserId BIGINT UNSIGNED NULL,
  TokenHash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  ExpiresAt DATETIME NOT NULL,
  UsedAt DATETIME NULL,
  RequiresMfa BOOLEAN NOT NULL DEFAULT TRUE,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY staff_invitations_staff_user_id_UK (StaffUserId),
  UNIQUE KEY staff_invitations_token_hash_UK (TokenHash),
  UNIQUE KEY staff_invitations_id_staff_user_id_UK (Id, StaffUserId),
  KEY idx_staff_invitations_expires_at (ExpiresAt),
  KEY idx_staff_invitations_created_by_staff_user_id (CreatedByStaffUserId),
  CONSTRAINT staff_invitations_mfa_required_CK CHECK (RequiresMfa = TRUE),
  CONSTRAINT staff_invitations_expiry_CK CHECK (ExpiresAt > CreatedAt),
  CONSTRAINT staff_invitations_usage_CK
    CHECK (UsedAt IS NULL OR (UsedAt >= CreatedAt AND UsedAt < ExpiresAt)),
  CONSTRAINT staff_invitations_staff_profile_FK
    FOREIGN KEY (StaffUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT staff_invitations_created_by_staff_profile_FK
    FOREIGN KEY (CreatedByStaffUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE StaffWebAuthnCredentials (
  CredentialId VARCHAR(2048) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  StaffUserId BIGINT UNSIGNED NOT NULL,
  PublicKey VARBINARY(2048) NOT NULL,
  SignatureCounter BIGINT UNSIGNED NOT NULL DEFAULT 0,
  Transports JSON NULL,
  DeviceType ENUM('singleDevice', 'multiDevice') NOT NULL,
  BackedUp BOOLEAN NOT NULL,
  Aaguid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  LastUsedAt DATETIME NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (CredentialId),
  UNIQUE KEY staff_webauthn_credentials_user_credential_UK (StaffUserId, CredentialId),
  KEY idx_staff_webauthn_credentials_staff_user_id (StaffUserId),
  CONSTRAINT staff_webauthn_credentials_transports_CK
    CHECK (Transports IS NULL OR JSON_TYPE(Transports) = 'ARRAY'),
  CONSTRAINT staff_webauthn_credentials_staff_profile_FK
    FOREIGN KEY (StaffUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER staff_profiles_active_webauthn_BU
BEFORE UPDATE ON StaffProfiles
FOR EACH ROW
SET NEW.MfaEnrolledAt = CASE
  WHEN NEW.Status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM StaffWebAuthnCredentials AS credential
      WHERE credential.StaffUserId = NEW.UserId
    )
  THEN NULL
  ELSE NEW.MfaEnrolledAt
END;

CREATE TABLE StaffWebAuthnChallenges (
  Id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  StaffUserId BIGINT UNSIGNED NOT NULL,
  InvitationId BIGINT UNSIGNED NULL,
  Purpose ENUM('registration', 'authentication') NOT NULL,
  Challenge VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  ExpiresAt DATETIME NOT NULL,
  ConsumedAt DATETIME NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY staff_webauthn_challenges_challenge_UK (Challenge),
  KEY idx_staff_webauthn_challenges_user_purpose (StaffUserId, Purpose),
  KEY idx_staff_webauthn_challenges_expires_at (ExpiresAt),
  KEY idx_staff_webauthn_challenges_invitation_user (InvitationId, StaffUserId),
  CONSTRAINT staff_webauthn_challenges_invitation_purpose_CK
    CHECK (
      (Purpose = 'registration' AND InvitationId IS NOT NULL)
      OR (Purpose = 'authentication' AND InvitationId IS NULL)
    ),
  CONSTRAINT staff_webauthn_challenges_expiry_CK CHECK (ExpiresAt > CreatedAt),
  CONSTRAINT staff_webauthn_challenges_staff_profile_FK
    FOREIGN KEY (StaffUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT staff_webauthn_challenges_invitation_FK
    FOREIGN KEY (InvitationId, StaffUserId) REFERENCES StaffInvitations(Id, StaffUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE CommunityProfiles (
  UserId BIGINT UNSIGNED NOT NULL,
  AccountType ENUM('community', 'staff') NOT NULL DEFAULT 'community',
  Status ENUM('inactive', 'active', 'banned') NOT NULL DEFAULT 'inactive',
  BannedByUserId BIGINT UNSIGNED NULL,
  BannedReason TEXT NULL,
  BannedAt DATETIME NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (UserId),
  KEY idx_community_profiles_status (Status),
  KEY idx_community_profiles_banned_by_user_id (BannedByUserId),
  CONSTRAINT community_profiles_account_type_CK CHECK (AccountType = 'community'),
  CONSTRAINT community_profiles_user_account_type_FK
    FOREIGN KEY (UserId, AccountType) REFERENCES Users(Id, AccountType)
    ON UPDATE RESTRICT
    ON DELETE CASCADE,
  CONSTRAINT community_profiles_banned_by_user_FK
    FOREIGN KEY (BannedByUserId) REFERENCES Users(Id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE CommunitySessions (
  Id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CommunityUserId BIGINT UNSIGNED NOT NULL,
  ExpiresAt DATETIME NOT NULL,
  RevokedAt DATETIME NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  KEY idx_community_sessions_user_id (CommunityUserId),
  KEY idx_community_sessions_expires_at (ExpiresAt),
  CONSTRAINT community_sessions_user_FK
    FOREIGN KEY (CommunityUserId) REFERENCES CommunityProfiles(UserId)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT community_sessions_expiry_CK CHECK (ExpiresAt > CreatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE StaffSessions (
  Id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  StaffUserId BIGINT UNSIGNED NOT NULL,
  WebAuthnCredentialId VARCHAR(2048) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MfaMethod ENUM('webauthn') NOT NULL DEFAULT 'webauthn',
  MfaVerifiedAt DATETIME NOT NULL,
  IpAddress VARCHAR(45) CHARACTER SET ascii COLLATE ascii_bin NULL,
  UserAgent VARCHAR(512) NULL,
  ExpiresAt DATETIME NOT NULL,
  RevokedAt DATETIME NULL,
  RevokedByStaffUserId BIGINT UNSIGNED NULL,
  RevocationType ENUM('logout', 'self', 'admin') NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  KEY idx_staff_sessions_user_id (StaffUserId),
  KEY idx_staff_sessions_user_credential (StaffUserId, WebAuthnCredentialId),
  KEY idx_staff_sessions_expires_at (ExpiresAt),
  KEY idx_staff_sessions_revoked_by_user_id (RevokedByStaffUserId),
  CONSTRAINT staff_sessions_user_FK
    FOREIGN KEY (StaffUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT staff_sessions_webauthn_credential_FK
    FOREIGN KEY (StaffUserId, WebAuthnCredentialId)
    REFERENCES StaffWebAuthnCredentials(StaffUserId, CredentialId)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT staff_sessions_revoked_by_user_FK
    FOREIGN KEY (RevokedByStaffUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT staff_sessions_expiry_CK CHECK (ExpiresAt > CreatedAt),
  CONSTRAINT staff_sessions_revocation_CK
    CHECK (
      (RevokedAt IS NULL AND RevokedByStaffUserId IS NULL AND RevocationType IS NULL)
      OR (RevokedAt IS NOT NULL AND RevocationType IS NOT NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER users_community_profile_AI
AFTER INSERT ON Users
FOR EACH ROW
INSERT INTO CommunityProfiles (
  UserId,
  AccountType,
  Status,
  BannedByUserId,
  BannedReason,
  BannedAt,
  CreatedAt,
  UpdatedAt
)
SELECT NEW.Id,
       'community',
       NEW.Status,
       NEW.BannedByUserId,
       NEW.BannedReason,
       NEW.BannedAt,
       NEW.CreatedAt,
       NEW.UpdatedAt
FROM DUAL
WHERE NEW.AccountType = 'community';

CREATE TRIGGER users_staff_profile_AI
AFTER INSERT ON Users
FOR EACH ROW
INSERT INTO StaffProfiles (UserId, AccountType, Status, CreatedAt, UpdatedAt)
SELECT NEW.Id,
       'staff',
       CASE NEW.Status
         WHEN 'active' THEN 'active'
         WHEN 'banned' THEN 'locked'
         ELSE 'invited'
       END,
       NEW.CreatedAt,
       NEW.UpdatedAt
FROM DUAL
WHERE NEW.AccountType = 'staff';

CREATE TRIGGER users_community_profile_AU
AFTER UPDATE ON Users
FOR EACH ROW
UPDATE CommunityProfiles
SET Status = NEW.Status,
    BannedByUserId = NEW.BannedByUserId,
    BannedReason = NEW.BannedReason,
    BannedAt = NEW.BannedAt
WHERE UserId = NEW.Id AND NEW.AccountType = 'community';

CREATE TRIGGER users_staff_profile_AU
AFTER UPDATE ON Users
FOR EACH ROW
UPDATE StaffProfiles
SET Status = CASE
               WHEN Status = 'disabled' THEN 'disabled'
               ELSE CASE NEW.Status
                 WHEN 'active' THEN 'active'
                 WHEN 'banned' THEN 'locked'
                 ELSE 'invited'
               END
             END
WHERE UserId = NEW.Id AND NEW.AccountType = 'staff';

-- ---------- Administrative audit ----------
-- BeforeValues and AfterValues contain only the redacted state required for
-- investigation. Secrets and authentication material must never be recorded.
CREATE TABLE AdminAuditLogs (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ActorUserId BIGINT UNSIGNED NOT NULL,
  Action VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  TargetType VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  TargetId VARCHAR(255) NOT NULL,
  Reason TEXT NULL,
  BeforeValues JSON NULL,
  AfterValues JSON NULL,
  IpAddress VARCHAR(45) CHARACTER SET ascii COLLATE ascii_bin NULL,
  UserAgent VARCHAR(512) NULL,
  CorrelationId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CreatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (Id),
  KEY idx_admin_audit_logs_created_at (CreatedAt, Id),
  KEY idx_admin_audit_logs_actor_created_at (ActorUserId, CreatedAt, Id),
  KEY idx_admin_audit_logs_action_created_at (Action, CreatedAt, Id),
  KEY idx_admin_audit_logs_target_created_at (TargetType, TargetId, CreatedAt, Id),
  KEY idx_admin_audit_logs_correlation_id (CorrelationId, CreatedAt, Id),
  CONSTRAINT admin_audit_logs_action_CK
    CHECK (CHAR_LENGTH(TRIM(Action)) > 0),
  CONSTRAINT admin_audit_logs_target_type_CK
    CHECK (CHAR_LENGTH(TRIM(TargetType)) > 0),
  CONSTRAINT admin_audit_logs_target_id_CK
    CHECK (CHAR_LENGTH(TRIM(TargetId)) > 0),
  CONSTRAINT admin_audit_logs_reason_CK
    CHECK (Reason IS NULL OR CHAR_LENGTH(TRIM(Reason)) > 0),
  CONSTRAINT admin_audit_logs_before_values_CK
    CHECK (BeforeValues IS NULL OR JSON_TYPE(BeforeValues) = 'OBJECT'),
  CONSTRAINT admin_audit_logs_after_values_CK
    CHECK (AfterValues IS NULL OR JSON_TYPE(AfterValues) = 'OBJECT'),
  CONSTRAINT admin_audit_logs_ip_address_CK
    CHECK (IpAddress IS NULL OR CHAR_LENGTH(TRIM(IpAddress)) > 0),
  CONSTRAINT admin_audit_logs_user_agent_CK
    CHECK (UserAgent IS NULL OR CHAR_LENGTH(TRIM(UserAgent)) > 0),
  CONSTRAINT admin_audit_logs_correlation_id_CK
    CHECK (CHAR_LENGTH(TRIM(CorrelationId)) = 36),
  CONSTRAINT admin_audit_logs_actor_FK
    FOREIGN KEY (ActorUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER admin_audit_logs_immutable_BU
BEFORE UPDATE ON AdminAuditLogs
FOR EACH ROW
SIGNAL SQLSTATE '45000'
  SET MYSQL_ERRNO = 1644,
      MESSAGE_TEXT = 'Admin audit logs are append-only: UPDATE is forbidden';

CREATE TRIGGER admin_audit_logs_immutable_BD
BEFORE DELETE ON AdminAuditLogs
FOR EACH ROW
SIGNAL SQLSTATE '45000'
  SET MYSQL_ERRNO = 1644,
      MESSAGE_TEXT = 'Admin audit logs are append-only: DELETE is forbidden';

CREATE TABLE UserModerationLogs (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  UserId BIGINT UNSIGNED NOT NULL,
  AdminId BIGINT UNSIGNED NOT NULL,
  Action ENUM('ban', 'unban') NOT NULL,
  Reason TEXT NOT NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  KEY idx_user_moderation_logs_user_id (UserId),
  KEY idx_user_moderation_logs_admin_id (AdminId),
  KEY idx_user_moderation_logs_created_at (CreatedAt),
  CONSTRAINT user_moderation_logs_user_FK
    FOREIGN KEY (UserId) REFERENCES Users(Id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT user_moderation_logs_admin_FK
    FOREIGN KEY (AdminId) REFERENCES Users(Id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
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
  FULLTEXT INDEX ft_recipes_title (Title),
  CONSTRAINT recipes_user_FK
    FOREIGN KEY (UserId) REFERENCES CommunityProfiles(UserId)
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

-- ---------- Recipe images ----------
CREATE TABLE RecipeImages (
  Id CHAR(36) NOT NULL,
  RecipeId BIGINT UNSIGNED NOT NULL,
  LargeStorageKey VARCHAR(512) NOT NULL,
  MediumStorageKey VARCHAR(512) NOT NULL,
  ThumbnailStorageKey VARCHAR(512) NOT NULL,
  OriginalWidth INT UNSIGNED NOT NULL,
  OriginalHeight INT UNSIGNED NOT NULL,
  LargeWidth INT UNSIGNED NOT NULL,
  LargeHeight INT UNSIGNED NOT NULL,
  LargeSizeBytes BIGINT UNSIGNED NOT NULL,
  AltText VARCHAR(255) NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY recipe_images_recipe_id_UK (RecipeId),
  CONSTRAINT recipe_images_recipe_FK
    FOREIGN KEY (RecipeId) REFERENCES Recipes(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
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
CREATE TABLE TagGroups (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  Name VARCHAR(100) NOT NULL,
  Slug VARCHAR(100) NOT NULL,
  SortOrder INT NOT NULL DEFAULT 1,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY tag_groups_name_UK (Name),
  UNIQUE KEY tag_groups_slug_UK (Slug),
  KEY idx_tag_groups_sort_order (SortOrder)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE Tags (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  GroupId BIGINT UNSIGNED NOT NULL,
  Name VARCHAR(255) NOT NULL,
  Slug VARCHAR(255) NOT NULL,
  PRIMARY KEY (Id),
  KEY idx_tags_group_id (GroupId),
  UNIQUE KEY tags_name_UK (Name),
  UNIQUE KEY tags_slug_UK (Slug),
  CONSTRAINT tags_group_FK
    FOREIGN KEY (GroupId) REFERENCES TagGroups(Id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
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
  Quantity DECIMAL(10,3) NULL,
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
    FOREIGN KEY (UserId) REFERENCES CommunityProfiles(UserId)
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
  KEY idx_comments_moderated_at (ModeratedAt),
  CONSTRAINT comments_recipe_FK
    FOREIGN KEY (RecipeId) REFERENCES Recipes(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT comments_user_FK
    FOREIGN KEY (UserId) REFERENCES CommunityProfiles(UserId)
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
