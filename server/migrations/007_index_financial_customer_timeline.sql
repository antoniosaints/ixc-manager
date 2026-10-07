-- The customer profile timeline filters financial events by customer and due
-- date. The original contract/date index cannot serve that access pattern.
ALTER TABLE retention_financial_events
  ADD INDEX idx_financial_customer_due (customer_id, due_at);
