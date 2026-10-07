CREATE TABLE retention_sync_state (
  resource_name VARCHAR(64) PRIMARY KEY, last_sync_at DATETIME NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE retention_customers (
  id BIGINT PRIMARY KEY, active CHAR(1) NOT NULL, name VARCHAR(255) NOT NULL, city VARCHAR(120) NULL, neighborhood VARCHAR(120) NULL,
  registered_at DATE NULL, satisfaction TINYINT NULL, seller_id BIGINT NULL, branch_id BIGINT NULL, raw_json JSON NULL, synced_at DATETIME NOT NULL
);
CREATE TABLE retention_contracts (
  id BIGINT PRIMARY KEY, customer_id BIGINT NOT NULL, plan_id BIGINT NULL, plan_name VARCHAR(255) NULL, signed_at DATE NULL, activated_at DATE NULL,
  renewal_at DATE NULL, status VARCHAR(20) NOT NULL, internet_status VARCHAR(20) NULL, speed_status VARCHAR(20) NULL, overdue_installments INT NULL,
  fidelity VARCHAR(255) NULL, expires_at DATE NULL, auto_block CHAR(1) NULL, suspended CHAR(1) NULL, suspension_started_at DATE NULL, suspension_ended_at DATE NULL,
  access_disabled_at DATETIME NULL, last_auto_block_at DATETIME NULL, last_manual_block_at DATETIME NULL, last_financial_late_at DATETIME NULL,
  last_trust_unlock_at DATETIME NULL, last_suspension_release_at DATETIME NULL, branch_id BIGINT NULL, seller_id BIGINT NULL, raw_json JSON NULL, synced_at DATETIME NOT NULL,
  INDEX idx_contract_customer (customer_id), INDEX idx_contract_status (status)
);
CREATE TABLE retention_financial_events (
  id BIGINT PRIMARY KEY, customer_id BIGINT NOT NULL, contract_id BIGINT NULL, issued_at DATE NULL, due_at DATE NULL, amount DECIMAL(12,2) NULL,
  status CHAR(1) NULL, open_amount DECIMAL(12,2) NULL, received_amount DECIMAL(12,2) NULL, paid_at DATE NULL, settled_at DATE NULL, released CHAR(1) NULL, raw_json JSON NULL, synced_at DATETIME NOT NULL,
  INDEX idx_financial_contract_due (contract_id, due_at)
);
CREATE TABLE retention_tickets (
  id BIGINT PRIMARY KEY, customer_id BIGINT NOT NULL, contract_id BIGINT NULL, subject_id BIGINT NULL, title VARCHAR(255) NULL, priority VARCHAR(20) NULL,
  ticket_status VARCHAR(20) NULL, sla_status VARCHAR(20) NULL, created_at_ixc DATETIME NULL, updated_at_ixc DATETIME NULL, raw_json JSON NULL, synced_at DATETIME NOT NULL,
  INDEX idx_ticket_customer_date (customer_id, created_at_ixc)
);
CREATE TABLE retention_service_orders (
  id BIGINT PRIMARY KEY, customer_id BIGINT NOT NULL, contract_id BIGINT NULL, subject_id BIGINT NULL, priority VARCHAR(20) NULL, status VARCHAR(20) NULL,
  sla_status VARCHAR(20) NULL, opened_at DATETIME NULL, closed_at DATETIME NULL, rescheduled_at DATETIME NULL, raw_json JSON NULL, synced_at DATETIME NOT NULL,
  INDEX idx_os_customer_date (customer_id, opened_at)
);
CREATE TABLE retention_contract_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, contract_id BIGINT NOT NULL, customer_id BIGINT NOT NULL, event_type VARCHAR(100) NULL, event_at DATETIME NULL, description TEXT NULL,
  external_key CHAR(64) NOT NULL UNIQUE, raw_json JSON NULL, synced_at DATETIME NOT NULL, INDEX idx_contract_history_customer_date (customer_id, event_at)
);
CREATE TABLE retention_subject_mappings (
  subject_id BIGINT PRIMARY KEY, internal_category ENUM('CONECTIVIDADE','PERFORMANCE','WIFI','FINANCEIRO','COMERCIAL','MUDANCA','CANCELAMENTO','EQUIPAMENTO','OUTROS') NOT NULL DEFAULT 'OUTROS', weight DECIMAL(5,2) NOT NULL DEFAULT 1, label VARCHAR(255) NULL, raw_json JSON NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE retention_logins (
  id BIGINT PRIMARY KEY, customer_id BIGINT NOT NULL, contract_id BIGINT NULL, login VARCHAR(255) NOT NULL UNIQUE, active CHAR(1) NULL, online CHAR(1) NULL,
  concentrator_id BIGINT NULL, concentrator VARCHAR(255) NULL, ftth_box_id BIGINT NULL, last_connection_started_at DATETIME NULL, last_connection_ended_at DATETIME NULL,
  disconnect_count INT NULL, last_disconnect_reason VARCHAR(100) NULL, raw_json JSON NULL, synced_at DATETIME NOT NULL,
  INDEX idx_login_customer (customer_id)
);
CREATE TABLE retention_radius_sessions (
  radacct_id BIGINT PRIMARY KEY, username VARCHAR(255) NOT NULL, started_at DATETIME NOT NULL, stopped_at DATETIME NULL, session_seconds INT NOT NULL DEFAULT 0,
  terminate_cause VARCHAR(100) NULL, raw_json JSON NULL, synced_at DATETIME NOT NULL, INDEX idx_radius_session_date (started_at), INDEX idx_radius_session_login (username)
);
CREATE TABLE retention_connections_daily (
  date DATE NOT NULL, login_id BIGINT NOT NULL, contract_id BIGINT NULL, customer_id BIGINT NULL, concentrator_id BIGINT NULL, concentrator VARCHAR(255) NULL, ftth_box_id BIGINT NULL,
  sessions INT NOT NULL DEFAULT 0, disconnects INT NOT NULL DEFAULT 0, avg_session_seconds INT NOT NULL DEFAULT 0, short_sessions INT NOT NULL DEFAULT 0, total_session_seconds BIGINT NOT NULL DEFAULT 0, main_terminate_cause VARCHAR(100) NULL,
  PRIMARY KEY (date, login_id), INDEX idx_connection_customer_date (customer_id, date)
);
CREATE TABLE retention_usage_monthly (
  login_id BIGINT NOT NULL, date DATE NOT NULL, customer_id BIGINT NULL, contract_id BIGINT NULL, download_consumption DECIMAL(16,2) NOT NULL DEFAULT 0, upload_consumption DECIMAL(16,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (login_id, date), INDEX idx_usage_customer_date (customer_id, date)
);
CREATE TABLE retention_risk_scores (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, customer_id BIGINT NOT NULL, contract_id BIGINT NOT NULL, score TINYINT NOT NULL, financial_score TINYINT NOT NULL, support_score TINYINT NOT NULL,
  network_score TINYINT NOT NULL, contract_score TINYINT NOT NULL, satisfaction_score TINYINT NOT NULL, risk_level ENUM('LOW','ATTENTION','MEDIUM','HIGH','CRITICAL') NOT NULL, calculated_at DATETIME NOT NULL,
  INDEX idx_risk_current (customer_id, calculated_at), INDEX idx_risk_level (risk_level)
);
CREATE TABLE retention_risk_factors (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, risk_score_id BIGINT NOT NULL, category VARCHAR(20) NOT NULL, code VARCHAR(64) NOT NULL, description VARCHAR(255) NOT NULL, points TINYINT NOT NULL, metadata_json JSON NULL,
  CONSTRAINT fk_factor_score FOREIGN KEY (risk_score_id) REFERENCES retention_risk_scores(id) ON DELETE CASCADE
);
CREATE TABLE retention_cancellations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, customer_id BIGINT NOT NULL, contract_id BIGINT NOT NULL UNIQUE, cancellation_date DATE NULL, cancellation_reason_id BIGINT NULL,
  cancellation_observation TEXT NULL, previous_risk_score TINYINT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
