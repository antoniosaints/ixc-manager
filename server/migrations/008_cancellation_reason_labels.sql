CREATE TABLE retention_cancellation_reasons (
  id BIGINT PRIMARY KEY,
  label VARCHAR(255) NOT NULL,
  active CHAR(1) NULL,
  synced_at DATETIME NOT NULL,
  INDEX idx_cancellation_reason_label (label)
);
