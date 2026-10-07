ALTER TABLE retention_logins
  MODIFY online VARCHAR(10) NULL;

ALTER TABLE retention_sync_state
  ADD COLUMN last_record_count INT NULL AFTER last_sync_at,
  ADD COLUMN last_success_at DATETIME NULL AFTER last_record_count,
  ADD COLUMN last_error VARCHAR(500) NULL AFTER last_success_at;
