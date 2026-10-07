ALTER TABLE retention_financial_events ADD INDEX idx_financial_overdue_lookup (status, due_at, contract_id);
ALTER TABLE retention_tickets ADD INDEX idx_ticket_open_lookup (ticket_status, customer_id);
ALTER TABLE retention_service_orders ADD INDEX idx_service_order_open_lookup (status, customer_id);
