CREATE TABLE retention_users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('USER','OPERATOR','ADMIN') NOT NULL DEFAULT 'USER',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_retention_users_role (role, active)
);

CREATE TABLE retention_user_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_retention_sessions_expiry (expires_at),
  CONSTRAINT fk_retention_session_user FOREIGN KEY (user_id) REFERENCES retention_users(id) ON DELETE CASCADE
);

ALTER TABLE retention_customer_workflow
  ADD COLUMN resolved_by_user_id BIGINT NULL,
  ADD CONSTRAINT fk_workflow_resolver FOREIGN KEY (resolved_by_user_id) REFERENCES retention_users(id) ON DELETE SET NULL;
