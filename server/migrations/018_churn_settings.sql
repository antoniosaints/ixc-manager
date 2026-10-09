CREATE TABLE IF NOT EXISTS retention_churn_settings (
  id TINYINT PRIMARY KEY,
  configuration JSON NOT NULL,
  updated_by_user_id BIGINT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_churn_settings_editor FOREIGN KEY (updated_by_user_id) REFERENCES retention_users(id) ON DELETE SET NULL
);
