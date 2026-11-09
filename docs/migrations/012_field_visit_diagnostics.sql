-- Add a separate schema for the current five-step field-visit MVP.
-- The legacy business_diagnostic_submissions table and its records are unchanged.
CREATE TABLE IF NOT EXISTS field_visit_diagnostic_submissions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    submission_uuid CHAR(36) COLLATE ascii_bin NOT NULL,
    payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    business_name VARCHAR(140) COLLATE utf8mb4_unicode_ci NOT NULL,
    business_type ENUM(
        'food_beverage',
        'accommodation',
        'retail',
        'services',
        'other'
    ) COLLATE ascii_bin NOT NULL,
    business_type_other VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    current_tools JSON NOT NULL,
    tools_other VARCHAR(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    biggest_operational_pain VARCHAR(500) COLLATE utf8mb4_unicode_ci NOT NULL,
    willingness_to_pay ENUM('yes', 'maybe', 'no') COLLATE ascii_bin NOT NULL,
    contact_name VARCHAR(140) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    whatsapp_number VARCHAR(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    follow_up_consent TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_field_visit_submission_uuid (submission_uuid),
    KEY idx_field_visit_created_at (created_at),
    KEY idx_field_visit_business_type (business_type),
    CONSTRAINT ck_field_visit_contact_consent CHECK (
        (follow_up_consent = 1 AND whatsapp_number IS NOT NULL AND CHAR_LENGTH(TRIM(whatsapp_number)) > 0)
        OR
        (follow_up_consent = 0 AND contact_name IS NULL AND whatsapp_number IS NULL)
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version, description)
VALUES ('012_field_visit_diagnostics', 'Add consent-safe five-step field visit submissions');
