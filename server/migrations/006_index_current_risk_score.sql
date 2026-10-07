-- Customer lists and analytics select the latest score by contract. This
-- index prevents those read queries from sorting the full score history and
-- starving the concurrent score-calculation worker.
ALTER TABLE retention_risk_scores
  ADD INDEX idx_risk_contract_current (contract_id, calculated_at, id);
