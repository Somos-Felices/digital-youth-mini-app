CREATE TABLE IF NOT EXISTS opportunity_research_evidence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  experiment_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  url VARCHAR(2048) NULL,
  description TEXT NOT NULL,
  evidence_type ENUM('source','output','cost_record','income_record','observation','other') NOT NULL DEFAULT 'other',
  captured_on DATE NULL,
  approval_status ENUM('internal','pending','approved','rejected') NOT NULL DEFAULT 'internal',
  reviewer VARCHAR(180) NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_research_evidence_experiment(experiment_id,approval_status),
  CONSTRAINT fk_research_evidence_experiment FOREIGN KEY(experiment_id) REFERENCES opportunity_research_experiments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS opportunity_research_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  experiment_id BIGINT UNSIGNED NOT NULL,
  payment_status ENUM('estimated','pending','received') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  platform_fees DECIMAL(12,2) NOT NULL DEFAULT 0,
  refunds DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_date DATE NULL,
  reference VARCHAR(255) NULL,
  notes TEXT NULL,
  created_by VARCHAR(180) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_research_payments_experiment(experiment_id,payment_status,currency),
  CONSTRAINT fk_research_payments_experiment FOREIGN KEY(experiment_id) REFERENCES opportunity_research_experiments(id) ON DELETE CASCADE,
  CONSTRAINT chk_research_payment_amount CHECK(amount>0),
  CONSTRAINT chk_research_payment_adjustments CHECK(platform_fees>=0 AND refunds>=0 AND platform_fees+refunds<=amount)
) ENGINE=InnoDB;
