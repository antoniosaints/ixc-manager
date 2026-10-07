CREATE TABLE retention_contract_attention (
  contract_id BIGINT PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  marked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  marked_by_user_id BIGINT NULL,
  INDEX idx_contract_attention_customer (customer_id, marked_at),
  CONSTRAINT fk_contract_attention_contract FOREIGN KEY (contract_id) REFERENCES retention_contracts(id) ON DELETE CASCADE,
  CONSTRAINT fk_contract_attention_marker FOREIGN KEY (marked_by_user_id) REFERENCES retention_users(id) ON DELETE SET NULL
);

-- A prioridade antiga era registrada por cliente. Preserve uma única prioridade
-- por cliente, associando-a ao contrato ativo de maior score atual.
INSERT IGNORE INTO retention_contract_attention (contract_id, customer_id, marked_at, marked_by_user_id)
SELECT ct.id, wf.customer_id, COALESCE(wf.attention_marked_at, NOW()), wf.attention_marked_by_user_id
  FROM retention_customer_workflow wf
  JOIN retention_contracts ct ON ct.customer_id=wf.customer_id AND ct.status <> 'I'
  LEFT JOIN retention_risk_scores rs ON rs.id=(SELECT id FROM retention_risk_scores x WHERE x.contract_id=ct.id ORDER BY calculated_at DESC,id DESC LIMIT 1)
 WHERE wf.attention_critical=1
   AND ct.id=(SELECT ct2.id FROM retention_contracts ct2 LEFT JOIN retention_risk_scores rs2 ON rs2.id=(SELECT id FROM retention_risk_scores y WHERE y.contract_id=ct2.id ORDER BY calculated_at DESC,id DESC LIMIT 1) WHERE ct2.customer_id=wf.customer_id AND ct2.status <> 'I' ORDER BY rs2.score DESC,rs2.calculated_at DESC,ct2.id DESC LIMIT 1);
