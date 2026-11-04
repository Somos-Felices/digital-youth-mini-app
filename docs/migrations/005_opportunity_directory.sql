-- Additive opportunity directory schema. Existing method research remains intact.
CREATE TABLE IF NOT EXISTS earning_opportunities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(160) NOT NULL,
  title VARCHAR(180) NOT NULL,
  provider VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  earning_activity TEXT NOT NULL,
  category VARCHAR(80) NOT NULL,
  official_url VARCHAR(2048) NULL,
  application_url VARCHAR(2048) NULL,
  eligible_countries JSON NOT NULL,
  supported_languages JSON NOT NULL,
  minimum_age SMALLINT UNSIGNED NULL,
  smartphone_compatible ENUM('yes','no','unknown') NOT NULL DEFAULT 'unknown',
  device_requirements TEXT NULL,
  internet_requirements TEXT NULL,
  free_entry_conditions TEXT NULL,
  identity_requirements TEXT NULL,
  professional_requirements TEXT NULL,
  experience_requirements TEXT NULL,
  screening TEXT NULL,
  work_allocation TEXT NULL,
  asynchronous ENUM('yes','no','unknown') NOT NULL DEFAULT 'unknown',
  advertised_rate DECIMAL(12,2) NULL,
  rate_currency CHAR(3) NULL,
  rate_basis VARCHAR(80) NULL,
  fees TEXT NULL,
  payout_method TEXT NULL,
  withdrawal_threshold TEXT NULL,
  payout_timing TEXT NULL,
  availability ENUM('available','limited','paused','closed','unknown') NOT NULL DEFAULT 'unknown',
  status ENUM('draft','under_validation','qualified','rejected','archived') NOT NULL DEFAULT 'draft',
  last_verified_at DATE NULL,
  next_review_at DATE NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_earning_opportunities_slug (slug),
  KEY idx_opportunity_public (is_published,status,availability),
  KEY idx_opportunity_review (next_review_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS opportunity_criteria (
  opportunity_id BIGINT UNSIGNED NOT NULL,
  criterion_code ENUM('phone_free_tools','independent','no_credentials','no_meetings') NOT NULL,
  assessment ENUM('pass','conditional','fail','not_verified') NOT NULL DEFAULT 'not_verified',
  explanation TEXT NOT NULL,
  source_ids JSON NOT NULL,
  PRIMARY KEY (opportunity_id,criterion_code),
  CONSTRAINT fk_opportunity_criteria_opportunity FOREIGN KEY (opportunity_id) REFERENCES earning_opportunities(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS opportunity_sources (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  opportunity_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  url VARCHAR(2048) NOT NULL,
  claim TEXT NOT NULL,
  reviewed_at DATE NULL,
  is_approved TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id), KEY idx_opportunity_sources_parent (opportunity_id,is_approved),
  CONSTRAINT fk_opportunity_sources_opportunity FOREIGN KEY (opportunity_id) REFERENCES earning_opportunities(id) ON DELETE CASCADE
) ENGINE=InnoDB;
