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
  CONSTRAINT users_banned_reason_length_CK
    CHECK (
      BannedReason IS NULL
      OR (CHAR_LENGTH(TRIM(BannedReason)) >= 10 AND CHAR_LENGTH(BannedReason) <= 1000)
    ),
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
  SessionVersion BIGINT UNSIGNED NOT NULL DEFAULT 1,
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
  CONSTRAINT staff_profiles_session_version_CK CHECK (SessionVersion > 0),
  CONSTRAINT staff_profiles_disablement_CK
    CHECK (
      (Status = 'disabled'
        AND DisabledByStaffUserId IS NOT NULL
        AND DisabledReason IS NOT NULL
        AND CHAR_LENGTH(TRIM(DisabledReason)) >= 10
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
    ON DELETE RESTRICT,
  CONSTRAINT staff_profiles_disabled_by_staff_profile_FK
    FOREIGN KEY (DisabledByStaffUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER staff_profiles_no_delete_BD
BEFORE DELETE ON StaffProfiles
FOR EACH ROW
SIGNAL SQLSTATE '45000'
  SET MYSQL_ERRNO = 1644,
      MESSAGE_TEXT = 'Staff profiles cannot be physically deleted; disable access instead';

CREATE TABLE StaffRoles (
  StaffUserId BIGINT UNSIGNED NOT NULL,
  RoleId BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (StaffUserId, RoleId),
  KEY idx_staff_roles_role_id (RoleId),
  CONSTRAINT staff_roles_staff_profile_FK
    FOREIGN KEY (StaffUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT staff_roles_role_FK
    FOREIGN KEY (RoleId) REFERENCES Roles(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dormant persistence model for a future two-person approval workflow.
-- Changing a request status never changes StaffRoles by itself.
CREATE TABLE StaffPrivilegeChangeRequests (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  TargetStaffUserId BIGINT UNSIGNED NOT NULL,
  RoleId BIGINT UNSIGNED NOT NULL,
  ChangeType ENUM('grant', 'revoke') NOT NULL,
  Status ENUM('requested', 'approved', 'rejected') NOT NULL DEFAULT 'requested',
  RequestedByStaffUserId BIGINT UNSIGNED NOT NULL,
  RequestReason TEXT NOT NULL,
  ReviewedByStaffUserId BIGINT UNSIGNED NULL,
  ReviewReason TEXT NULL,
  RequestedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  ReviewedAt DATETIME(6) NULL,
  PRIMARY KEY (Id),
  KEY idx_staff_privilege_change_requests_queue (Status, RequestedAt, Id),
  KEY idx_staff_privilege_change_requests_target (TargetStaffUserId, Status, RequestedAt, Id),
  KEY idx_staff_privilege_change_requests_role_id (RoleId),
  KEY idx_staff_privilege_change_requests_requester (RequestedByStaffUserId, RequestedAt, Id),
  KEY idx_staff_privilege_change_requests_reviewer (ReviewedByStaffUserId, ReviewedAt, Id),
  CONSTRAINT staff_privilege_change_requests_request_reason_CK
    CHECK (
      CHAR_LENGTH(TRIM(RequestReason)) >= 10
      AND CHAR_LENGTH(RequestReason) <= 1000
    ),
  CONSTRAINT staff_privilege_change_requests_no_self_request_CK
    CHECK (RequestedByStaffUserId <> TargetStaffUserId),
  CONSTRAINT staff_privilege_change_requests_review_separation_CK
    CHECK (
      ReviewedByStaffUserId IS NULL
      OR (ReviewedByStaffUserId <> RequestedByStaffUserId
          AND ReviewedByStaffUserId <> TargetStaffUserId)
    ),
  CONSTRAINT staff_privilege_change_requests_lifecycle_CK
    CHECK (
      (Status = 'requested'
        AND ReviewedByStaffUserId IS NULL
        AND ReviewReason IS NULL
        AND ReviewedAt IS NULL)
      OR (Status IN ('approved', 'rejected')
        AND ReviewedByStaffUserId IS NOT NULL
        AND ReviewReason IS NOT NULL
        AND CHAR_LENGTH(TRIM(ReviewReason)) >= 10
        AND CHAR_LENGTH(ReviewReason) <= 1000
        AND ReviewedAt IS NOT NULL
        AND ReviewedAt >= RequestedAt)
    ),
  CONSTRAINT staff_privilege_change_requests_target_FK
    FOREIGN KEY (TargetStaffUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT staff_privilege_change_requests_role_FK
    FOREIGN KEY (RoleId) REFERENCES Roles(Id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT staff_privilege_change_requests_requester_FK
    FOREIGN KEY (RequestedByStaffUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT staff_privilege_change_requests_reviewer_FK
    FOREIGN KEY (ReviewedByStaffUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
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
    ON DELETE RESTRICT,
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
    ON DELETE RESTRICT
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
END,
NEW.SessionVersion = CASE
  WHEN (OLD.Status <> NEW.Status AND NEW.Status IN ('locked', 'disabled'))
    OR (OLD.MfaEnrolledAt IS NOT NULL AND NEW.MfaEnrolledAt IS NULL)
  THEN OLD.SessionVersion + 1
  ELSE GREATEST(OLD.SessionVersion, NEW.SessionVersion)
END;

CREATE TABLE StaffWebAuthnChallenges (
  Id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  StaffUserId BIGINT UNSIGNED NOT NULL,
  InvitationId BIGINT UNSIGNED NULL,
  Purpose ENUM('registration', 'authentication') NOT NULL,
  SessionVersion BIGINT UNSIGNED NOT NULL DEFAULT 1,
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
  CONSTRAINT staff_webauthn_challenges_session_version_CK CHECK (SessionVersion > 0),
  CONSTRAINT staff_webauthn_challenges_staff_profile_FK
    FOREIGN KEY (StaffUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
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
  CONSTRAINT community_profiles_ban_CK
    CHECK (
      (Status = 'banned'
        AND BannedByUserId IS NOT NULL
        AND BannedReason IS NOT NULL
        AND CHAR_LENGTH(TRIM(BannedReason)) >= 10
        AND CHAR_LENGTH(BannedReason) <= 1000
        AND BannedAt IS NOT NULL)
      OR (Status <> 'banned'
        AND BannedByUserId IS NULL
        AND BannedReason IS NULL
        AND BannedAt IS NULL)
    ),
  CONSTRAINT community_profiles_user_account_type_FK
    FOREIGN KEY (UserId, AccountType) REFERENCES Users(Id, AccountType)
    ON UPDATE RESTRICT
    ON DELETE CASCADE,
  CONSTRAINT community_profiles_banned_by_user_FK
    FOREIGN KEY (BannedByUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE CommunitySessions (
  Id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CommunityUserId BIGINT UNSIGNED NOT NULL,
  ExpiresAt DATETIME NOT NULL,
  RevokedAt DATETIME NULL,
  RevocationType ENUM('logout', 'password_changed') NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  KEY idx_community_sessions_user_active (CommunityUserId, RevokedAt, ExpiresAt),
  KEY idx_community_sessions_expires_at (ExpiresAt),
  CONSTRAINT community_sessions_user_FK
    FOREIGN KEY (CommunityUserId) REFERENCES CommunityProfiles(UserId)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT community_sessions_expiry_CK CHECK (ExpiresAt > CreatedAt),
  CONSTRAINT community_sessions_revocation_CK
    CHECK (
      (RevokedAt IS NULL AND RevocationType IS NULL)
      OR (RevokedAt IS NOT NULL AND RevocationType IS NOT NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE StaffSessions (
  Id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  StaffUserId BIGINT UNSIGNED NOT NULL,
  SessionVersion BIGINT UNSIGNED NOT NULL DEFAULT 1,
  WebAuthnCredentialId VARCHAR(2048) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MfaMethod ENUM('webauthn') NOT NULL DEFAULT 'webauthn',
  MfaVerifiedAt DATETIME NOT NULL,
  IpAddress VARCHAR(45) CHARACTER SET ascii COLLATE ascii_bin NULL,
  UserAgent VARCHAR(512) NULL,
  ExpiresAt DATETIME NOT NULL,
  RevokedAt DATETIME NULL,
  RevokedByStaffUserId BIGINT UNSIGNED NULL,
  RevocationType ENUM(
    'logout',
    'self',
    'account_disabled',
    'account_locked',
    'password_changed',
    'mfa_reset',
    'suspected_compromise',
    'roles_removed'
  ) NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  KEY idx_staff_sessions_user_active (StaffUserId, RevokedAt, ExpiresAt),
  KEY idx_staff_sessions_user_credential (StaffUserId, WebAuthnCredentialId),
  KEY idx_staff_sessions_expires_at (ExpiresAt),
  KEY idx_staff_sessions_revoked_by_user_id (RevokedByStaffUserId),
  CONSTRAINT staff_sessions_user_FK
    FOREIGN KEY (StaffUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT staff_sessions_webauthn_credential_FK
    FOREIGN KEY (StaffUserId, WebAuthnCredentialId)
    REFERENCES StaffWebAuthnCredentials(StaffUserId, CredentialId)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT staff_sessions_revoked_by_user_FK
    FOREIGN KEY (RevokedByStaffUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT staff_sessions_expiry_CK CHECK (ExpiresAt > CreatedAt),
  CONSTRAINT staff_sessions_session_version_CK CHECK (SessionVersion > 0),
  CONSTRAINT staff_sessions_revocation_CK
    CHECK (
      (RevokedAt IS NULL AND RevokedByStaffUserId IS NULL AND RevocationType IS NULL)
      OR (RevokedAt IS NOT NULL
        AND RevocationType IN ('password_changed', 'mfa_reset', 'account_locked', 'roles_removed')
        AND RevokedByStaffUserId IS NULL)
      OR (RevokedAt IS NOT NULL
        AND RevocationType IN ('logout', 'self', 'account_disabled', 'suspected_compromise')
        AND RevokedByStaffUserId IS NOT NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Authentication changes revoke only the matching session realm. The triggers
-- also cover password resets because they persist a new password hash.
CREATE TRIGGER users_community_password_sessions_AU
AFTER UPDATE ON Users
FOR EACH ROW
UPDATE CommunitySessions
SET RevokedAt = CURRENT_TIMESTAMP,
    RevocationType = 'password_changed'
WHERE CommunityUserId = NEW.Id
  AND NEW.AccountType = 'community'
  AND NOT (OLD.Password <=> NEW.Password)
  AND RevokedAt IS NULL
  AND ExpiresAt > CURRENT_TIMESTAMP;

CREATE TRIGGER users_staff_password_sessions_AU
AFTER UPDATE ON Users
FOR EACH ROW
UPDATE StaffSessions
SET RevokedAt = CURRENT_TIMESTAMP,
    RevokedByStaffUserId = NULL,
    RevocationType = 'password_changed'
WHERE StaffUserId = NEW.Id
  AND NEW.AccountType = 'staff'
  AND NOT (OLD.Password <=> NEW.Password)
  AND RevokedAt IS NULL
  AND ExpiresAt > CURRENT_TIMESTAMP;

CREATE TRIGGER users_staff_password_session_version_AU
AFTER UPDATE ON Users
FOR EACH ROW
UPDATE StaffProfiles
SET SessionVersion = SessionVersion + 1
WHERE UserId = NEW.Id
  AND NEW.AccountType = 'staff'
  AND NOT (OLD.Password <=> NEW.Password);

CREATE TRIGGER staff_profiles_disabled_sessions_AU
AFTER UPDATE ON StaffProfiles
FOR EACH ROW
UPDATE StaffSessions
SET RevokedAt = CURRENT_TIMESTAMP,
    RevokedByStaffUserId = NEW.DisabledByStaffUserId,
    RevocationType = 'account_disabled'
WHERE StaffUserId = NEW.UserId
  AND OLD.Status <> 'disabled'
  AND NEW.Status = 'disabled'
  AND RevokedAt IS NULL
  AND ExpiresAt > CURRENT_TIMESTAMP;

CREATE TRIGGER staff_profiles_locked_sessions_AU
AFTER UPDATE ON StaffProfiles
FOR EACH ROW
UPDATE StaffSessions
SET RevokedAt = CURRENT_TIMESTAMP,
    RevokedByStaffUserId = NULL,
    RevocationType = 'account_locked'
WHERE StaffUserId = NEW.UserId
  AND OLD.Status <> 'locked'
  AND NEW.Status = 'locked'
  AND NEW.MfaEnrolledAt IS NOT NULL
  AND RevokedAt IS NULL
  AND ExpiresAt > CURRENT_TIMESTAMP;

CREATE TRIGGER staff_profiles_mfa_reset_sessions_AU
AFTER UPDATE ON StaffProfiles
FOR EACH ROW
UPDATE StaffSessions
SET RevokedAt = CURRENT_TIMESTAMP,
    RevokedByStaffUserId = NULL,
    RevocationType = 'mfa_reset'
WHERE StaffUserId = NEW.UserId
  AND OLD.MfaEnrolledAt IS NOT NULL
  AND NEW.MfaEnrolledAt IS NULL
  AND RevokedAt IS NULL
  AND ExpiresAt > CURRENT_TIMESTAMP;

CREATE TRIGGER staff_roles_removed_session_version_AD
AFTER DELETE ON StaffRoles
FOR EACH ROW
UPDATE StaffProfiles
SET SessionVersion = SessionVersion + 1
WHERE UserId = OLD.StaffUserId
  AND NOT EXISTS (
    SELECT 1
    FROM StaffRoles
    WHERE StaffUserId = OLD.StaffUserId
  );

CREATE TRIGGER staff_roles_removed_sessions_AD
AFTER DELETE ON StaffRoles
FOR EACH ROW
UPDATE StaffSessions
SET RevokedAt = CURRENT_TIMESTAMP,
    RevokedByStaffUserId = NULL,
    RevocationType = 'roles_removed'
WHERE StaffUserId = OLD.StaffUserId
  AND NOT EXISTS (
    SELECT 1
    FROM StaffRoles
    WHERE StaffUserId = OLD.StaffUserId
  )
  AND RevokedAt IS NULL
  AND ExpiresAt > CURRENT_TIMESTAMP;

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

-- Specialized moderation histories are typed, append-only extensions of the
-- global audit. Their primary key is the audit entry they enrich; actor,
-- action, reason, correlation id and timestamp stay in one source of truth.
CREATE TABLE StaffModerationLogs (
  AdminAuditLogId BIGINT UNSIGNED NOT NULL,
  StaffUserId BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (AdminAuditLogId),
  KEY idx_staff_moderation_logs_staff_user_id (StaffUserId, AdminAuditLogId),
  CONSTRAINT staff_moderation_logs_audit_log_FK
    FOREIGN KEY (AdminAuditLogId) REFERENCES AdminAuditLogs(Id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT staff_moderation_logs_staff_profile_FK
    FOREIGN KEY (StaffUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER staff_moderation_logs_immutable_BU
BEFORE UPDATE ON StaffModerationLogs
FOR EACH ROW
SIGNAL SQLSTATE '45000'
  SET MYSQL_ERRNO = 1644,
      MESSAGE_TEXT = 'Staff moderation logs are append-only: UPDATE is forbidden';

CREATE TRIGGER staff_moderation_logs_immutable_BD
BEFORE DELETE ON StaffModerationLogs
FOR EACH ROW
SIGNAL SQLSTATE '45000'
  SET MYSQL_ERRNO = 1644,
      MESSAGE_TEXT = 'Staff moderation logs are append-only: DELETE is forbidden';

CREATE TABLE UserModerationLogs (
  AdminAuditLogId BIGINT UNSIGNED NOT NULL,
  UserId BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (AdminAuditLogId),
  KEY idx_user_moderation_logs_user_id (UserId, AdminAuditLogId),
  CONSTRAINT user_moderation_logs_audit_log_FK
    FOREIGN KEY (AdminAuditLogId) REFERENCES AdminAuditLogs(Id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT user_moderation_logs_user_FK
    FOREIGN KEY (UserId) REFERENCES CommunityProfiles(UserId)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER user_moderation_logs_immutable_BU
BEFORE UPDATE ON UserModerationLogs
FOR EACH ROW
SIGNAL SQLSTATE '45000'
  SET MYSQL_ERRNO = 1644,
      MESSAGE_TEXT = 'User moderation logs are append-only: UPDATE is forbidden';

CREATE TRIGGER user_moderation_logs_immutable_BD
BEFORE DELETE ON UserModerationLogs
FOR EACH ROW
SIGNAL SQLSTATE '45000'
  SET MYSQL_ERRNO = 1644,
      MESSAGE_TEXT = 'User moderation logs are append-only: DELETE is forbidden';

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
  ArchiveReason TEXT NULL,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY recipes_slug_UK (Slug),
  KEY idx_recipes_user_id (UserId),
  KEY idx_recipes_category_id (CategoryId),
  KEY idx_recipes_status (Status),
  KEY idx_recipes_moderated_by_user_id (ModeratedByUserId),
  FULLTEXT INDEX ft_recipes_title (Title),
  CONSTRAINT recipes_rejection_reason_CK
    CHECK (
      (Status = 'rejected'
        AND RejectionReason IS NOT NULL
        AND CHAR_LENGTH(TRIM(RejectionReason)) >= 10
        AND CHAR_LENGTH(RejectionReason) <= 1000)
      OR (Status <> 'rejected'
        AND (RejectionReason IS NULL
          OR (CHAR_LENGTH(TRIM(RejectionReason)) >= 10 AND CHAR_LENGTH(RejectionReason) <= 1000)))
    ),
  CONSTRAINT recipes_archive_reason_CK
    CHECK (
      ArchiveReason IS NULL
      OR (CHAR_LENGTH(TRIM(ArchiveReason)) >= 10 AND CHAR_LENGTH(ArchiveReason) <= 1000)
    ),
  CONSTRAINT recipes_user_FK
    FOREIGN KEY (UserId) REFERENCES CommunityProfiles(UserId)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT recipes_category_FK
    FOREIGN KEY (CategoryId) REFERENCES RecipeCategories(Id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT recipes_moderated_by_user_FK
    FOREIGN KEY (ModeratedByUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- RecipeId remains as the stable business target after an authorized hard
-- deletion, so the moderation journal deliberately has no target foreign key.
CREATE TABLE RecipeModerationLogs (
  AdminAuditLogId BIGINT UNSIGNED NOT NULL,
  RecipeId BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (AdminAuditLogId),
  KEY idx_recipe_moderation_logs_recipe_id (RecipeId, AdminAuditLogId),
  CONSTRAINT recipe_moderation_logs_audit_log_FK
    FOREIGN KEY (AdminAuditLogId) REFERENCES AdminAuditLogs(Id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER recipe_moderation_logs_immutable_BU
BEFORE UPDATE ON RecipeModerationLogs
FOR EACH ROW
SIGNAL SQLSTATE '45000'
  SET MYSQL_ERRNO = 1644,
      MESSAGE_TEXT = 'Recipe moderation logs are append-only: UPDATE is forbidden';

CREATE TRIGGER recipe_moderation_logs_immutable_BD
BEFORE DELETE ON RecipeModerationLogs
FOR EACH ROW
SIGNAL SQLSTATE '45000'
  SET MYSQL_ERRNO = 1644,
      MESSAGE_TEXT = 'Recipe moderation logs are append-only: DELETE is forbidden';

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
  NormalizedName VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  Slug VARCHAR(255) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  Status ENUM('active', 'deprecated', 'merged') NOT NULL DEFAULT 'active',
  MergedIntoIngredientId BIGINT UNSIGNED NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY ingredients_active_normalized_name_UK ((
    CAST(
      CASE
        WHEN Status = 'active' THEN TRIM(REGEXP_REPLACE(LOWER(Name), '[^[:alnum:]]+', ' '))
        ELSE NULL
      END AS CHAR(255) CHARACTER SET utf8mb4
    ) COLLATE utf8mb4_0900_ai_ci
  )),
  UNIQUE KEY ingredients_slug_UK (Slug),
  KEY idx_ingredients_status_name (Status, Name),
  KEY idx_ingredients_merged_into_ingredient_id (MergedIntoIngredientId),
  CONSTRAINT ingredients_name_CK
    CHECK (CHAR_LENGTH(Name) = CHAR_LENGTH(TRIM(Name)) AND CHAR_LENGTH(TRIM(Name)) > 0),
  CONSTRAINT ingredients_normalized_name_CK
    CHECK (
      CHAR_LENGTH(NormalizedName) = CHAR_LENGTH(TRIM(NormalizedName))
      AND CHAR_LENGTH(TRIM(NormalizedName)) > 0
      AND BINARY NormalizedName = BINARY LOWER(NormalizedName)
      AND NormalizedName REGEXP '^[a-z0-9]+( [a-z0-9]+)*$'
      AND CONVERT(NormalizedName USING utf8mb4) COLLATE utf8mb4_0900_ai_ci = TRIM(REGEXP_REPLACE(LOWER(Name), '[^[:alnum:]]+', ' ')) COLLATE utf8mb4_0900_ai_ci
    ),
  CONSTRAINT ingredients_slug_CK
    CHECK (
      BINARY Slug = BINARY LOWER(Slug)
      AND Slug REGEXP '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
  CONSTRAINT ingredients_merge_status_CK
    CHECK (
      (Status = 'merged' AND MergedIntoIngredientId IS NOT NULL)
      OR (Status IN ('active', 'deprecated') AND MergedIntoIngredientId IS NULL)
    ),
  CONSTRAINT ingredients_merged_into_ingredient_FK
    FOREIGN KEY (MergedIntoIngredientId) REFERENCES Ingredients(Id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IngredientAliases (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  IngredientId BIGINT UNSIGNED NOT NULL,
  Name VARCHAR(255) NOT NULL,
  NormalizedName VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  LanguageCode VARCHAR(35) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY ingredient_aliases_language_normalized_name_UK (LanguageCode, NormalizedName),
  KEY idx_ingredient_aliases_ingredient_language (IngredientId, LanguageCode, Name),
  CONSTRAINT ingredient_aliases_name_CK
    CHECK (CHAR_LENGTH(Name) = CHAR_LENGTH(TRIM(Name)) AND CHAR_LENGTH(TRIM(Name)) > 0),
  CONSTRAINT ingredient_aliases_normalized_name_CK
    CHECK (
      CHAR_LENGTH(NormalizedName) = CHAR_LENGTH(TRIM(NormalizedName))
      AND CHAR_LENGTH(TRIM(NormalizedName)) > 0
      AND BINARY NormalizedName = BINARY LOWER(NormalizedName)
      AND NormalizedName REGEXP '^[a-z0-9]+( [a-z0-9]+)*$'
      AND CONVERT(NormalizedName USING utf8mb4) COLLATE utf8mb4_0900_ai_ci = TRIM(REGEXP_REPLACE(LOWER(Name), '[^[:alnum:]]+', ' ')) COLLATE utf8mb4_0900_ai_ci
    ),
  CONSTRAINT ingredient_aliases_language_code_CK
    CHECK (
      CHAR_LENGTH(LanguageCode) = CHAR_LENGTH(TRIM(LanguageCode))
      AND BINARY LanguageCode = BINARY LOWER(LanguageCode)
      AND LanguageCode REGEXP '^[a-z]{2,8}(-[a-z0-9]{1,8})*$'
    ),
  CONSTRAINT ingredient_aliases_ingredient_FK
    FOREIGN KEY (IngredientId) REFERENCES Ingredients(Id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER ingredient_aliases_canonical_ingredient_BI
BEFORE INSERT ON IngredientAliases
FOR EACH ROW
BEGIN
  DECLARE canonical_ingredient_status VARCHAR(16) DEFAULT NULL;

  SELECT Status
  INTO canonical_ingredient_status
  FROM Ingredients
  WHERE Id = NEW.IngredientId
  FOR SHARE;

  IF canonical_ingredient_status IS NULL OR canonical_ingredient_status <> 'active' THEN
    SIGNAL SQLSTATE '45000'
      SET MYSQL_ERRNO = 1644,
          MESSAGE_TEXT = 'Ingredient aliases can only reference active canonical ingredients';
  END IF;
END;

CREATE TRIGGER ingredient_aliases_canonical_ingredient_BU
BEFORE UPDATE ON IngredientAliases
FOR EACH ROW
BEGIN
  DECLARE canonical_ingredient_status VARCHAR(16) DEFAULT NULL;

  SELECT Status
  INTO canonical_ingredient_status
  FROM Ingredients
  WHERE Id = NEW.IngredientId
  FOR SHARE;

  IF canonical_ingredient_status IS NULL OR canonical_ingredient_status <> 'active' THEN
    SIGNAL SQLSTATE '45000'
      SET MYSQL_ERRNO = 1644,
          MESSAGE_TEXT = 'Ingredient aliases can only reference active canonical ingredients';
  END IF;
END;

CREATE TRIGGER ingredients_merge_integrity_BI
BEFORE INSERT ON Ingredients
FOR EACH ROW
BEGIN
  DECLARE canonical_ingredient_status VARCHAR(16) DEFAULT NULL;

  IF NEW.MergedIntoIngredientId IS NOT NULL AND NEW.MergedIntoIngredientId = NEW.Id THEN
    SIGNAL SQLSTATE '45000'
      SET MYSQL_ERRNO = 1644,
          MESSAGE_TEXT = 'An ingredient cannot be merged into itself';
  END IF;
  IF NEW.MergedIntoIngredientId IS NOT NULL THEN
    SELECT Status
    INTO canonical_ingredient_status
    FROM Ingredients
    WHERE Id = NEW.MergedIntoIngredientId
    FOR SHARE;

    IF canonical_ingredient_status IS NULL OR canonical_ingredient_status <> 'active' THEN
      SIGNAL SQLSTATE '45000'
        SET MYSQL_ERRNO = 1644,
            MESSAGE_TEXT = 'A merged ingredient must reference an active canonical ingredient';
    END IF;
  END IF;
END;

CREATE TRIGGER ingredients_merge_integrity_BU
BEFORE UPDATE ON Ingredients
FOR EACH ROW
BEGIN
  DECLARE canonical_ingredient_status VARCHAR(16) DEFAULT NULL;

  IF NEW.MergedIntoIngredientId IS NOT NULL AND NEW.MergedIntoIngredientId = NEW.Id THEN
    SIGNAL SQLSTATE '45000'
      SET MYSQL_ERRNO = 1644,
          MESSAGE_TEXT = 'An ingredient cannot be merged into itself';
  END IF;
  IF NEW.MergedIntoIngredientId IS NOT NULL THEN
    SELECT Status
    INTO canonical_ingredient_status
    FROM Ingredients
    WHERE Id = NEW.MergedIntoIngredientId
    FOR SHARE;

    IF canonical_ingredient_status IS NULL OR canonical_ingredient_status <> 'active' THEN
      SIGNAL SQLSTATE '45000'
        SET MYSQL_ERRNO = 1644,
            MESSAGE_TEXT = 'A merged ingredient must reference an active canonical ingredient';
    END IF;
  END IF;
  IF NEW.Status <> 'active'
     AND EXISTS (
       SELECT 1
       FROM Ingredients AS merged_ingredient
       WHERE merged_ingredient.MergedIntoIngredientId = NEW.Id
     ) THEN
    SIGNAL SQLSTATE '45000'
      SET MYSQL_ERRNO = 1644,
          MESSAGE_TEXT = 'A canonical ingredient merge target must remain active';
  END IF;
  IF NEW.Status <> 'active'
     AND EXISTS (
       SELECT 1
       FROM IngredientAliases AS ingredient_alias
       WHERE ingredient_alias.IngredientId = NEW.Id
     ) THEN
    SIGNAL SQLSTATE '45000'
      SET MYSQL_ERRNO = 1644,
          MESSAGE_TEXT = 'An ingredient with aliases must remain active';
  END IF;
END;

CREATE TRIGGER ingredients_no_delete_BD
BEFORE DELETE ON Ingredients
FOR EACH ROW
SIGNAL SQLSTATE '45000'
  SET MYSQL_ERRNO = 1644,
      MESSAGE_TEXT = 'Ingredients cannot be physically deleted; deprecate or merge them instead';

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
  NormalizedName VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  Slug VARCHAR(255) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  Description VARCHAR(1000) NULL,
  Status ENUM('active', 'deprecated', 'merged') NOT NULL DEFAULT 'active',
  MergedIntoTagId BIGINT UNSIGNED NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY tags_active_normalized_name_UK ((
    CAST(
      CASE
        WHEN Status = 'active' THEN TRIM(REGEXP_REPLACE(LOWER(Name), '[^[:alnum:]]+', ' '))
        ELSE NULL
      END AS CHAR(255) CHARACTER SET utf8mb4
    ) COLLATE utf8mb4_0900_ai_ci
  )),
  UNIQUE KEY tags_slug_UK (Slug),
  KEY idx_tags_group_status_name (GroupId, Status, Name),
  KEY idx_tags_status_name (Status, Name),
  KEY idx_tags_merged_into_tag_id (MergedIntoTagId),
  CONSTRAINT tags_name_CK
    CHECK (CHAR_LENGTH(Name) = CHAR_LENGTH(TRIM(Name)) AND CHAR_LENGTH(TRIM(Name)) > 0),
  CONSTRAINT tags_normalized_name_CK
    CHECK (
      CHAR_LENGTH(NormalizedName) = CHAR_LENGTH(TRIM(NormalizedName))
      AND CHAR_LENGTH(TRIM(NormalizedName)) > 0
      AND BINARY NormalizedName = BINARY LOWER(NormalizedName)
      AND NormalizedName REGEXP '^[a-z0-9]+( [a-z0-9]+)*$'
      AND CONVERT(NormalizedName USING utf8mb4) COLLATE utf8mb4_0900_ai_ci = TRIM(REGEXP_REPLACE(LOWER(Name), '[^[:alnum:]]+', ' ')) COLLATE utf8mb4_0900_ai_ci
    ),
  CONSTRAINT tags_slug_CK
    CHECK (
      BINARY Slug = BINARY LOWER(Slug)
      AND Slug REGEXP '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
  CONSTRAINT tags_description_CK
    CHECK (
      Description IS NULL
      OR (CHAR_LENGTH(Description) = CHAR_LENGTH(TRIM(Description))
          AND CHAR_LENGTH(TRIM(Description)) > 0)
    ),
  CONSTRAINT tags_merge_status_CK
    CHECK (
      (Status = 'merged' AND MergedIntoTagId IS NOT NULL)
      OR (Status IN ('active', 'deprecated') AND MergedIntoTagId IS NULL)
    ),
  CONSTRAINT tags_group_FK
    FOREIGN KEY (GroupId) REFERENCES TagGroups(Id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT tags_merged_into_tag_FK
    FOREIGN KEY (MergedIntoTagId) REFERENCES Tags(Id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER tags_merge_integrity_BI
BEFORE INSERT ON Tags
FOR EACH ROW
BEGIN
  DECLARE canonical_tag_status VARCHAR(16) DEFAULT NULL;

  IF NEW.MergedIntoTagId IS NOT NULL AND NEW.MergedIntoTagId = NEW.Id THEN
    SIGNAL SQLSTATE '45000'
      SET MYSQL_ERRNO = 1644,
          MESSAGE_TEXT = 'A tag cannot be merged into itself';
  END IF;
  IF NEW.MergedIntoTagId IS NOT NULL THEN
    SELECT Status
    INTO canonical_tag_status
    FROM Tags
    WHERE Id = NEW.MergedIntoTagId
    FOR SHARE;

    IF canonical_tag_status IS NULL OR canonical_tag_status <> 'active' THEN
      SIGNAL SQLSTATE '45000'
        SET MYSQL_ERRNO = 1644,
            MESSAGE_TEXT = 'A merged tag must reference an active canonical tag';
    END IF;
  END IF;
END;

CREATE TRIGGER tags_merge_integrity_BU
BEFORE UPDATE ON Tags
FOR EACH ROW
BEGIN
  DECLARE canonical_tag_status VARCHAR(16) DEFAULT NULL;

  IF NEW.MergedIntoTagId IS NOT NULL AND NEW.MergedIntoTagId = NEW.Id THEN
    SIGNAL SQLSTATE '45000'
      SET MYSQL_ERRNO = 1644,
          MESSAGE_TEXT = 'A tag cannot be merged into itself';
  END IF;
  IF NEW.MergedIntoTagId IS NOT NULL THEN
    SELECT Status
    INTO canonical_tag_status
    FROM Tags
    WHERE Id = NEW.MergedIntoTagId
    FOR SHARE;

    IF canonical_tag_status IS NULL OR canonical_tag_status <> 'active' THEN
      SIGNAL SQLSTATE '45000'
        SET MYSQL_ERRNO = 1644,
            MESSAGE_TEXT = 'A merged tag must reference an active canonical tag';
    END IF;
  END IF;
  IF NEW.Status <> 'active'
     AND EXISTS (
       SELECT 1
       FROM Tags AS merged_tag
       WHERE merged_tag.MergedIntoTagId = NEW.Id
     ) THEN
    SIGNAL SQLSTATE '45000'
      SET MYSQL_ERRNO = 1644,
          MESSAGE_TEXT = 'A canonical merge target must remain active';
  END IF;
END;

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
  DisplayText VARCHAR(255) NOT NULL,
  Quantity DECIMAL(10,3) NULL,
  Unit VARCHAR(64) NULL,
  Note VARCHAR(255) NULL,
  SortOrder INT NOT NULL DEFAULT 1,
  PRIMARY KEY (Id),
  KEY idx_recipe_ingredients_recipe_sort (RecipeId, SortOrder),
  KEY idx_recipe_ingredients_ingredient_id (IngredientId),
  CONSTRAINT recipe_ingredients_display_text_CK
    CHECK (
      CHAR_LENGTH(DisplayText) = CHAR_LENGTH(TRIM(DisplayText))
      AND CHAR_LENGTH(DisplayText) > 0
    ),
  CONSTRAINT recipe_ingredients_recipe_FK
    FOREIGN KEY (RecipeId) REFERENCES Recipes(Id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT recipe_ingredients_ingredient_FK
    FOREIGN KEY (IngredientId) REFERENCES Ingredients(Id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER recipe_ingredients_active_ingredient_BI
BEFORE INSERT ON RecipeIngredients
FOR EACH ROW
BEGIN
  DECLARE referenced_ingredient_status VARCHAR(16) DEFAULT NULL;

  SELECT Status
  INTO referenced_ingredient_status
  FROM Ingredients
  WHERE Id = NEW.IngredientId
  FOR SHARE;

  IF referenced_ingredient_status IS NULL OR referenced_ingredient_status <> 'active' THEN
    SIGNAL SQLSTATE '45000'
      SET MYSQL_ERRNO = 1644,
          MESSAGE_TEXT = 'Recipes can only reference active canonical ingredients';
  END IF;
END;

CREATE TRIGGER recipe_ingredients_active_ingredient_BU
BEFORE UPDATE ON RecipeIngredients
FOR EACH ROW
BEGIN
  DECLARE referenced_ingredient_status VARCHAR(16) DEFAULT NULL;

  SELECT Status
  INTO referenced_ingredient_status
  FROM Ingredients
  WHERE Id = NEW.IngredientId
  FOR SHARE;

  IF referenced_ingredient_status IS NULL OR referenced_ingredient_status <> 'active' THEN
    SIGNAL SQLSTATE '45000'
      SET MYSQL_ERRNO = 1644,
          MESSAGE_TEXT = 'Recipes can only reference active canonical ingredients';
  END IF;
END;

CREATE TRIGGER ingredients_merged_recipe_associations_BU
BEFORE UPDATE ON Ingredients
FOR EACH ROW
BEGIN
  IF OLD.Status <> 'merged'
     AND NEW.Status = 'merged'
     AND EXISTS (
       SELECT 1
       FROM RecipeIngredients
       WHERE IngredientId = NEW.Id
     ) THEN
    SIGNAL SQLSTATE '45000'
      SET MYSQL_ERRNO = 1644,
          MESSAGE_TEXT = 'An ingredient must have no recipe associations before being merged';
  END IF;
END;

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

CREATE TRIGGER recipe_tags_active_tag_BI
BEFORE INSERT ON RecipeTags
FOR EACH ROW
BEGIN
  DECLARE referenced_tag_status VARCHAR(16) DEFAULT NULL;

  SELECT Status
  INTO referenced_tag_status
  FROM Tags
  WHERE Id = NEW.TagId
  FOR SHARE;

  IF referenced_tag_status IS NULL OR referenced_tag_status <> 'active' THEN
    SIGNAL SQLSTATE '45000'
      SET MYSQL_ERRNO = 1644,
          MESSAGE_TEXT = 'Recipes can only reference active canonical tags';
  END IF;
END;

CREATE TRIGGER tags_merged_recipe_associations_BU
BEFORE UPDATE ON Tags
FOR EACH ROW
BEGIN
  IF OLD.Status <> 'merged'
     AND NEW.Status = 'merged'
     AND EXISTS (
       SELECT 1
       FROM RecipeTags
       WHERE TagId = NEW.Id
     ) THEN
    SIGNAL SQLSTATE '45000'
      SET MYSQL_ERRNO = 1644,
          MESSAGE_TEXT = 'A tag must have no recipe associations before being merged';
  END IF;
END;

CREATE TRIGGER tags_no_delete_BD
BEFORE DELETE ON Tags
FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1
    FROM RecipeTags
    WHERE TagId = OLD.Id
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MYSQL_ERRNO = 1644,
          MESSAGE_TEXT = 'Referenced tags cannot be physically deleted; deprecate or merge them instead';
  END IF;

  SIGNAL SQLSTATE '45000'
    SET MYSQL_ERRNO = 1644,
        MESSAGE_TEXT = 'Tags cannot be physically deleted; deprecate or merge them instead';
END;

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
  ModerationReason TEXT NULL,
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
  CONSTRAINT comments_moderation_CK
    CHECK (
      (ModeratedAt IS NOT NULL
        AND ModeratedByUserId IS NOT NULL
        AND ModerationReason IS NOT NULL
        AND CHAR_LENGTH(TRIM(ModerationReason)) >= 10
        AND CHAR_LENGTH(ModerationReason) <= 1000)
      OR (ModeratedAt IS NULL
        AND ModeratedByUserId IS NULL
        AND ModerationReason IS NULL)
    ),
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
    FOREIGN KEY (ModeratedByUserId) REFERENCES StaffProfiles(UserId)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT comments_deleted_by_FK
    FOREIGN KEY (DeletedByUserId) REFERENCES Users(Id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,

  CONSTRAINT comments_rating_chk
    CHECK (Rating IS NULL OR (Rating BETWEEN 1 AND 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- CommentId remains as the stable business target after an authorized hard
-- deletion, so the moderation journal deliberately has no target foreign key.
CREATE TABLE CommentModerationLogs (
  AdminAuditLogId BIGINT UNSIGNED NOT NULL,
  CommentId BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (AdminAuditLogId),
  KEY idx_comment_moderation_logs_comment_id (CommentId, AdminAuditLogId),
  CONSTRAINT comment_moderation_logs_audit_log_FK
    FOREIGN KEY (AdminAuditLogId) REFERENCES AdminAuditLogs(Id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER comment_moderation_logs_immutable_BU
BEFORE UPDATE ON CommentModerationLogs
FOR EACH ROW
SIGNAL SQLSTATE '45000'
  SET MYSQL_ERRNO = 1644,
      MESSAGE_TEXT = 'Comment moderation logs are append-only: UPDATE is forbidden';

CREATE TRIGGER comment_moderation_logs_immutable_BD
BEFORE DELETE ON CommentModerationLogs
FOR EACH ROW
SIGNAL SQLSTATE '45000'
  SET MYSQL_ERRNO = 1644,
      MESSAGE_TEXT = 'Comment moderation logs are append-only: DELETE is forbidden';
