ALTER TABLE retention_customers
  ADD COLUMN phone VARCHAR(40) NULL,
  ADD COLUMN mobile_phone VARCHAR(40) NULL,
  ADD COLUMN commercial_phone VARCHAR(40) NULL,
  ADD COLUMN whatsapp VARCHAR(40) NULL;

CREATE TABLE retention_customer_workflow (
  customer_id BIGINT PRIMARY KEY,
  status ENUM('OPEN','RESOLVED') NOT NULL DEFAULT 'OPEN',
  resolved_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customer_workflow_status (status)
);

CREATE TABLE retention_customer_notes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer_notes_created (customer_id, created_at)
);
