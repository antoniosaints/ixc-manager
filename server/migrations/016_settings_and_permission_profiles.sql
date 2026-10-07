CREATE TABLE IF NOT EXISTS retention_permission_profiles (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL DEFAULT '',
  permissions JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE retention_users
  ADD COLUMN profile_id BIGINT NULL,
  ADD COLUMN permission_overrides JSON NULL,
  ADD CONSTRAINT fk_user_permission_profile FOREIGN KEY (profile_id) REFERENCES retention_permission_profiles(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS retention_system_settings (
  id TINYINT PRIMARY KEY,
  appearance JSON NOT NULL,
  updated_by_user_id BIGINT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_editor FOREIGN KEY (updated_by_user_id) REFERENCES retention_users(id) ON DELETE SET NULL
);
