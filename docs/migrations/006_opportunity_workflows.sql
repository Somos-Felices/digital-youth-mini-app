-- Column additions are guarded because MySQL DDL auto-commits and a previous
-- attempt may have stopped after applying some columns. No data backfill is
-- needed: new review states deliberately default to not_verified / pending.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='earning_opportunities' AND column_name='summary')=0,'ALTER TABLE earning_opportunities ADD COLUMN summary TEXT NULL','SELECT 1'); PREPARE m FROM @s; EXECUTE m; DEALLOCATE PREPARE m;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='earning_opportunities' AND column_name='value_created')=0,'ALTER TABLE earning_opportunities ADD COLUMN value_created TEXT NULL','SELECT 1'); PREPARE m FROM @s; EXECUTE m; DEALLOCATE PREPARE m;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='earning_opportunities' AND column_name='intended_audience')=0,'ALTER TABLE earning_opportunities ADD COLUMN intended_audience TEXT NULL','SELECT 1'); PREPARE m FROM @s; EXECUTE m; DEALLOCATE PREPARE m;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='earning_opportunities' AND column_name='monetisation_mechanism')=0,'ALTER TABLE earning_opportunities ADD COLUMN monetisation_mechanism TEXT NULL','SELECT 1'); PREPARE m FROM @s; EXECUTE m; DEALLOCATE PREPARE m;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='earning_opportunities' AND column_name='distribution_mechanism')=0,'ALTER TABLE earning_opportunities ADD COLUMN distribution_mechanism TEXT NULL','SELECT 1'); PREPARE m FROM @s; EXECUTE m; DEALLOCATE PREPARE m;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='earning_opportunities' AND column_name='language_requirements')=0,'ALTER TABLE earning_opportunities ADD COLUMN language_requirements TEXT NULL','SELECT 1'); PREPARE m FROM @s; EXECUTE m; DEALLOCATE PREPARE m;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='earning_opportunities' AND column_name='startup_requirements')=0,'ALTER TABLE earning_opportunities ADD COLUMN startup_requirements TEXT NULL','SELECT 1'); PREPARE m FROM @s; EXECUTE m; DEALLOCATE PREPARE m;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='earning_opportunities' AND column_name='audience_requirements')=0,'ALTER TABLE earning_opportunities ADD COLUMN audience_requirements TEXT NULL','SELECT 1'); PREPARE m FROM @s; EXECUTE m; DEALLOCATE PREPARE m;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='earning_opportunities' AND column_name='meeting_requirements')=0,'ALTER TABLE earning_opportunities ADD COLUMN meeting_requirements TEXT NULL','SELECT 1'); PREPARE m FROM @s; EXECUTE m; DEALLOCATE PREPARE m;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='earning_opportunities' AND column_name='startup_costs')=0,'ALTER TABLE earning_opportunities ADD COLUMN startup_costs TEXT NULL','SELECT 1'); PREPARE m FROM @s; EXECUTE m; DEALLOCATE PREPARE m;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='earning_opportunities' AND column_name='platform_restrictions')=0,'ALTER TABLE earning_opportunities ADD COLUMN platform_restrictions TEXT NULL','SELECT 1'); PREPARE m FROM @s; EXECUTE m; DEALLOCATE PREPARE m;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='earning_opportunities' AND column_name='execution_difficulty')=0,'ALTER TABLE earning_opportunities ADD COLUMN execution_difficulty ENUM(''easy'',''moderate'',''hard'',''unknown'') NOT NULL DEFAULT ''unknown''','SELECT 1'); PREPARE m FROM @s; EXECUTE m; DEALLOCATE PREPARE m;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='earning_opportunities' AND column_name='publication_status')=0,'ALTER TABLE earning_opportunities ADD COLUMN publication_status ENUM(''draft'',''under_review'',''published'',''archived'') NOT NULL DEFAULT ''draft''','SELECT 1'); PREPARE m FROM @s; EXECUTE m; DEALLOCATE PREPARE m;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='earning_opportunities' AND column_name='qualification_status')=0,'ALTER TABLE earning_opportunities ADD COLUMN qualification_status ENUM(''qualified'',''under_validation'',''conditional'',''disqualified'',''not_verified'') NOT NULL DEFAULT ''not_verified''','SELECT 1'); PREPARE m FROM @s; EXECUTE m; DEALLOCATE PREPARE m;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='opportunity_sources' AND column_name='publisher')=0,'ALTER TABLE opportunity_sources ADD COLUMN publisher VARCHAR(255) NULL','SELECT 1'); PREPARE m FROM @s; EXECUTE m; DEALLOCATE PREPARE m;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='opportunity_sources' AND column_name='source_type')=0,'ALTER TABLE opportunity_sources ADD COLUMN source_type VARCHAR(80) NOT NULL DEFAULT ''official''','SELECT 1'); PREPARE m FROM @s; EXECUTE m; DEALLOCATE PREPARE m;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='opportunity_sources' AND column_name='evidence_notes')=0,'ALTER TABLE opportunity_sources ADD COLUMN evidence_notes TEXT NULL','SELECT 1'); PREPARE m FROM @s; EXECUTE m; DEALLOCATE PREPARE m;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='opportunity_sources' AND column_name='next_review_at')=0,'ALTER TABLE opportunity_sources ADD COLUMN next_review_at DATE NULL','SELECT 1'); PREPARE m FROM @s; EXECUTE m; DEALLOCATE PREPARE m;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='opportunity_sources' AND column_name='approval_status')=0,'ALTER TABLE opportunity_sources ADD COLUMN approval_status ENUM(''pending'',''approved'',''rejected'',''archived'') NOT NULL DEFAULT ''pending''','SELECT 1'); PREPARE m FROM @s; EXECUTE m; DEALLOCATE PREPARE m;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='opportunity_sources' AND column_name='reviewer')=0,'ALTER TABLE opportunity_sources ADD COLUMN reviewer VARCHAR(180) NULL','SELECT 1'); PREPARE m FROM @s; EXECUTE m; DEALLOCATE PREPARE m;

CREATE TABLE IF NOT EXISTS opportunity_steps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  opportunity_id BIGINT UNSIGNED NOT NULL,
  step_number SMALLINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  required_tools JSON NOT NULL,
  expected_outcome TEXT NOT NULL,
  estimated_minutes SMALLINT UNSIGNED NULL,
  estimated_cost DECIMAL(12,2) NULL,
  cost_currency CHAR(3) NULL,
  prerequisites TEXT NULL,
  PRIMARY KEY(id), UNIQUE KEY uq_opportunity_step(opportunity_id,step_number),
  CONSTRAINT fk_opportunity_steps_parent FOREIGN KEY(opportunity_id) REFERENCES earning_opportunities(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS opportunity_review_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  opportunity_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(60) NOT NULL,
  record_type VARCHAR(60) NULL,
  record_id BIGINT UNSIGNED NULL,
  previous_value JSON NULL,
  new_value JSON NULL,
  reviewer VARCHAR(180) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_opportunity_history_parent(opportunity_id,created_at),
  CONSTRAINT fk_opportunity_history_parent FOREIGN KEY(opportunity_id) REFERENCES earning_opportunities(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS opportunity_research_experiments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  opportunity_id BIGINT UNSIGNED NOT NULL,
  hypothesis TEXT NOT NULL,
  test_design TEXT NOT NULL,
  participant_ref VARCHAR(120) NULL,
  country CHAR(2) NULL,
  language VARCHAR(80) NULL,
  device VARCHAR(120) NULL,
  starting_conditions TEXT NULL,
  tools_used JSON NOT NULL,
  steps_attempted TEXT NULL,
  application_result TEXT NULL,
  work_completed TEXT NULL,
  actual_output TEXT NULL,
  time_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  expenses DECIMAL(12,2) NOT NULL DEFAULT 0,
  expense_currency CHAR(3) NULL,
  failures TEXT NULL,
  rejections TEXT NULL,
  received_income DECIMAL(12,2) NOT NULL DEFAULT 0,
  income_currency CHAR(3) NULL,
  payment_date DATE NULL,
  payment_fees DECIMAL(12,2) NOT NULL DEFAULT 0,
  repeat_events INT UNSIGNED NOT NULL DEFAULT 0,
  lessons_learned TEXT NULL,
  final_assessment TEXT NULL,
  status ENUM('planned','in_progress','completed','cancelled') NOT NULL DEFAULT 'planned',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_opportunity_experiment_parent(opportunity_id,status),
  CONSTRAINT fk_opportunity_experiment_parent FOREIGN KEY(opportunity_id) REFERENCES earning_opportunities(id) ON DELETE CASCADE
) ENGINE=InnoDB;
