CREATE TABLE retention_cities (
  id BIGINT PRIMARY KEY,
  label VARCHAR(120) NOT NULL,
  state_id BIGINT NULL,
  synced_at DATETIME NOT NULL,
  INDEX idx_city_label (label)
);
