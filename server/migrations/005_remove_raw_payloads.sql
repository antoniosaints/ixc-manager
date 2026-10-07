-- The normalized columns are the retention data model. Keeping entire IXC
-- payloads duplicates storage and can retain credentials present in Radius
-- responses, so raw source documents are deliberately not persisted.
ALTER TABLE retention_customers DROP COLUMN raw_json;
ALTER TABLE retention_contracts DROP COLUMN raw_json;
ALTER TABLE retention_financial_events DROP COLUMN raw_json;
ALTER TABLE retention_tickets DROP COLUMN raw_json;
ALTER TABLE retention_service_orders DROP COLUMN raw_json;
ALTER TABLE retention_contract_history DROP COLUMN raw_json;
ALTER TABLE retention_subject_mappings DROP COLUMN raw_json;
ALTER TABLE retention_logins DROP COLUMN raw_json;
ALTER TABLE retention_radius_sessions DROP COLUMN raw_json;
