CREATE TABLE IF NOT EXISTS business_diagnostic_status_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    submission_id BIGINT UNSIGNED NOT NULL,

    previous_status ENUM(
        'new',
        'reviewed',
        'qualified',
        'not_qualified',
        'follow_up'
    ) DEFAULT NULL,

    new_status ENUM(
        'new',
        'reviewed',
        'qualified',
        'not_qualified',
        'follow_up'
    ) NOT NULL,

    changed_by VARCHAR(120) NOT NULL DEFAULT 'admin',

    change_reason VARCHAR(500) DEFAULT NULL,

    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    KEY idx_submission_changed_at (
        submission_id,
        changed_at
    ),

    KEY idx_changed_at (changed_at),

    CONSTRAINT fk_status_history_submission
        FOREIGN KEY (submission_id)
        REFERENCES business_diagnostic_submissions(id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- Record the existing status of every submission
-- as its initial audit-history entry.
INSERT INTO business_diagnostic_status_history (
    submission_id,
    previous_status,
    new_status,
    changed_by,
    change_reason,
    changed_at
)
SELECT
    s.id,
    NULL,
    s.submission_status,
    'system',
    'Initial status recorded during audit-history migration',
    COALESCE(s.updated_at, s.created_at, CURRENT_TIMESTAMP)
FROM business_diagnostic_submissions s
WHERE NOT EXISTS (
    SELECT 1
    FROM business_diagnostic_status_history h
    WHERE h.submission_id = s.id
);

INSERT IGNORE INTO schema_migrations (
    version,
    description
)
VALUES (
    '002_submission_status_history',
    'Create submission status audit history'
);
