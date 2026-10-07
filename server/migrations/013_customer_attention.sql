ALTER TABLE retention_customer_workflow
  ADD COLUMN attention_critical TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN attention_marked_at DATETIME NULL,
  ADD COLUMN attention_marked_by_user_id BIGINT NULL,
  ADD INDEX idx_customer_workflow_attention (attention_critical, attention_marked_at),
  ADD CONSTRAINT fk_workflow_attention_marker FOREIGN KEY (attention_marked_by_user_id) REFERENCES retention_users(id) ON DELETE SET NULL;
