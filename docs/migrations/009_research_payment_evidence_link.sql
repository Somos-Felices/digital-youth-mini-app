ALTER TABLE opportunity_research_payments
  ADD COLUMN evidence_id BIGINT UNSIGNED NULL AFTER experiment_id,
  ADD KEY idx_research_payments_evidence(evidence_id),
  ADD CONSTRAINT fk_research_payment_evidence
    FOREIGN KEY(evidence_id) REFERENCES opportunity_research_evidence(id)
    ON DELETE RESTRICT;
