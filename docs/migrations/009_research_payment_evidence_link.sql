ALTER TABLE opportunity_research_payments
  ADD COLUMN evidence_id BIGINT UNSIGNED NULL;

ALTER TABLE opportunity_research_payments
  ADD INDEX idx_research_payments_evidence (evidence_id);

ALTER TABLE opportunity_research_payments
  ADD CONSTRAINT fk_research_payment_evidence
  FOREIGN KEY (evidence_id)
  REFERENCES opportunity_research_evidence(id)
  ON DELETE RESTRICT;
