CREATE TABLE IF NOT EXISTS retention_order_analysis_history (
  id CHAR(36) PRIMARY KEY,
  subject_id BIGINT NOT NULL,
  subject_name VARCHAR(512) NOT NULL,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  provider VARCHAR(16) NOT NULL,
  model VARCHAR(200) NOT NULL,
  total_orders INT NOT NULL,
  summary TEXT NOT NULL,
  snapshot JSON NOT NULL,
  generated_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  created_by_user_id BIGINT NULL,
  INDEX idx_order_analysis_history_date (created_at,id),
  INDEX idx_order_analysis_history_subject (subject_id,created_at)
);
