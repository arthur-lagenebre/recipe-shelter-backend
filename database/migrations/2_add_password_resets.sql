USE recipe_shelter;

CREATE TABLE PasswordResets (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  UserId BIGINT UNSIGNED NOT NULL,
  TokenHash CHAR(64) NOT NULL,
  ExpiresAt DATETIME NOT NULL,
  UsedAt DATETIME NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (Id),
  KEY idx_password_resets_user_id (UserId),
  KEY idx_password_resets_expires_at (ExpiresAt),

  CONSTRAINT password_resets_user_FK
    FOREIGN KEY (UserId) REFERENCES Users(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;