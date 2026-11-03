-- Tracks migrations applied to this database.
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) NOT NULL,
    description VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (version)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- Initial business diagnostic submission schema.
CREATE TABLE IF NOT EXISTS business_diagnostic_submissions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    submission_uuid CHAR(36) COLLATE utf8mb4_unicode_ci NOT NULL,

    pilot_location VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
    participant_name VARCHAR(120) COLLATE utf8mb4_unicode_ci NOT NULL,
    business_name VARCHAR(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    business_type VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,

    current_tools JSON NOT NULL,
    biggest_operational_pain TEXT COLLATE utf8mb4_unicode_ci NOT NULL,

    pain_frequency ENUM(
        'daily',
        'weekly',
        'monthly',
        'occasionally',
        'unsure'
    ) COLLATE utf8mb4_unicode_ci NOT NULL,

    willingness_to_pay ENUM(
        'yes',
        'maybe',
        'no',
        'unsure'
    ) COLLATE utf8mb4_unicode_ci NOT NULL,

    budget_amount DECIMAL(12,2) DEFAULT NULL,
    budget_currency CHAR(3) COLLATE utf8mb4_unicode_ci DEFAULT NULL,

    follow_up_consent TINYINT(1) NOT NULL DEFAULT 0,

    contact_name VARCHAR(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,

    contact_method ENUM(
        'whatsapp',
        'phone',
        'email'
    ) COLLATE utf8mb4_unicode_ci DEFAULT NULL,

    contact_value VARCHAR(190) COLLATE utf8mb4_unicode_ci DEFAULT NULL,

    submission_status ENUM(
        'new',
        'reviewed',
        'qualified',
        'not_qualified',
        'follow_up'
    ) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'new',

    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY submission_uuid (submission_uuid),

    KEY idx_location (pilot_location),
    KEY idx_status (submission_status),
    KEY idx_created_at (created_at)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- Register the initial schema version.
INSERT IGNORE INTO schema_migrations (
    version,
    description
)
VALUES (
    '001_initial_schema',
    'Create business diagnostic submissions table'
);
