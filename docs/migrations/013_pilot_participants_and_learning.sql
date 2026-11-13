-- Digital Youth: pilot locations, participants and learning.
-- Additive migration. Historical migrations 001-012 are untouched.

CREATE TABLE IF NOT EXISTS pilot_sites (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name VARCHAR(140) NOT NULL,
    city VARCHAR(100) NOT NULL,
    region VARCHAR(100) NOT NULL,
    country_code CHAR(2) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_pilot_sites_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO pilot_sites
    (id, code, name, city, region, country_code)
VALUES
    (1, 'nusa-lembongan', 'Nusa Lembongan', 'Nusa Lembongan', 'Bali', 'ID'),
    (2, 'bengaluru', 'Bengaluru', 'Bengaluru', 'Karnataka', 'IN');

ALTER TABLE field_visit_diagnostic_submissions
    ADD COLUMN pilot_site_id BIGINT UNSIGNED NOT NULL DEFAULT 1 AFTER id;

ALTER TABLE field_visit_diagnostic_submissions
    ADD COLUMN review_status ENUM('new','under_review','prioritised','deferred','rejected','matched','resolved') NOT NULL DEFAULT 'new';

ALTER TABLE field_visit_diagnostic_submissions
    ADD COLUMN priority ENUM('low','normal','high','urgent') NULL DEFAULT NULL;

ALTER TABLE field_visit_diagnostic_submissions
    ADD COLUMN coordinator_notes TEXT NULL;

ALTER TABLE field_visit_diagnostic_submissions
    ADD COLUMN reviewed_by_admin_id BIGINT UNSIGNED NULL;

ALTER TABLE field_visit_diagnostic_submissions
    ADD COLUMN reviewed_at DATETIME NULL;

ALTER TABLE field_visit_diagnostic_submissions
    ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE field_visit_diagnostic_submissions
    ADD KEY idx_field_visit_site_status (pilot_site_id, review_status, created_at);

ALTER TABLE field_visit_diagnostic_submissions
    ADD KEY idx_field_visit_priority (priority, created_at);

ALTER TABLE field_visit_diagnostic_submissions
    ADD CONSTRAINT fk_field_visit_site
    FOREIGN KEY (pilot_site_id) REFERENCES pilot_sites(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE field_visit_diagnostic_submissions
    ADD CONSTRAINT fk_field_visit_reviewer
    FOREIGN KEY (reviewed_by_admin_id) REFERENCES admin_users(id)
    ON DELETE SET NULL ON UPDATE RESTRICT;

CREATE TABLE IF NOT EXISTS participant_invitations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(254) COLLATE utf8mb4_unicode_ci NOT NULL,
    display_name VARCHAR(140) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    pilot_site_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    expires_at DATETIME NOT NULL,
    accepted_at DATETIME DEFAULT NULL,
    revoked_at DATETIME DEFAULT NULL,
    invited_by_admin_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_participant_invitation_token (token_hash),
    KEY idx_participant_invitation_email (email, expires_at),
    CONSTRAINT fk_participant_invitation_site
        FOREIGN KEY (pilot_site_id) REFERENCES pilot_sites(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_participant_invitation_admin
        FOREIGN KEY (invited_by_admin_id) REFERENCES admin_users(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS participant_accounts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(254) COLLATE utf8mb4_unicode_ci NOT NULL,
    display_name VARCHAR(140) COLLATE utf8mb4_unicode_ci NOT NULL,
    password_hash VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
    pilot_site_id BIGINT UNSIGNED NOT NULL,
    phone VARCHAR(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    about TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    working_model ENUM('individual','collaborative','both') NOT NULL DEFAULT 'both',
    date_of_birth DATE DEFAULT NULL,
    adult_participation_confirmed TINYINT(1) NOT NULL DEFAULT 0,
    account_status ENUM('active','suspended','closed') NOT NULL DEFAULT 'active',
    profile_visibility ENUM(
        'private','shared_with_coordinators','public_portfolio'
    ) NOT NULL DEFAULT 'shared_with_coordinators',
    last_login_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_participant_email (email),
    KEY idx_participant_site_status (pilot_site_id, account_status),
    CONSTRAINT ck_participant_adult
        CHECK (adult_participation_confirmed = 1),
    CONSTRAINT fk_participant_site
        FOREIGN KEY (pilot_site_id) REFERENCES pilot_sites(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS participant_sessions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    participant_id BIGINT UNSIGNED NOT NULL,
    session_token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    csrf_token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    expires_at DATETIME NOT NULL,
    last_used_at DATETIME DEFAULT NULL,
    revoked_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_participant_session_token (session_token_hash),
    KEY idx_participant_sessions_user_expiry (participant_id, expires_at),
    CONSTRAINT fk_participant_sessions_user
        FOREIGN KEY (participant_id) REFERENCES participant_accounts(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS participant_skills (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    participant_id BIGINT UNSIGNED NOT NULL,
    skill_name VARCHAR(120) COLLATE utf8mb4_unicode_ci NOT NULL,
    proficiency ENUM('beginner','developing','competent','advanced')
        NOT NULL DEFAULT 'beginner',
    evidence_notes TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    verified_by_admin_id BIGINT UNSIGNED DEFAULT NULL,
    verified_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_participant_skill (participant_id, skill_name),
    CONSTRAINT fk_participant_skills_user
        FOREIGN KEY (participant_id) REFERENCES participant_accounts(id)
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_participant_skills_verifier
        FOREIGN KEY (verified_by_admin_id) REFERENCES admin_users(id)
        ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS participant_interests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    participant_id BIGINT UNSIGNED NOT NULL,
    interest VARCHAR(120) COLLATE utf8mb4_unicode_ci NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_participant_interest (participant_id, interest),
    CONSTRAINT fk_participant_interests_user
        FOREIGN KEY (participant_id) REFERENCES participant_accounts(id)
        ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS participant_portfolio_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    participant_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(180) COLLATE utf8mb4_unicode_ci NOT NULL,
    description TEXT COLLATE utf8mb4_unicode_ci NOT NULL,
    item_type ENUM('exercise','demonstration','project','other')
        NOT NULL DEFAULT 'other',
    external_url VARCHAR(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    visibility ENUM('private','coordinators','public')
        NOT NULL DEFAULT 'private',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_portfolio_participant_visibility (participant_id, visibility),
    CONSTRAINT fk_portfolio_participant
        FOREIGN KEY (participant_id) REFERENCES participant_accounts(id)
        ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_modules (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    slug VARCHAR(160) COLLATE utf8mb4_unicode_ci NOT NULL,
    title VARCHAR(180) COLLATE utf8mb4_unicode_ci NOT NULL,
    summary VARCHAR(500) COLLATE utf8mb4_unicode_ci NOT NULL,
    content_markdown MEDIUMTEXT COLLATE utf8mb4_unicode_ci NOT NULL,
    skill_category VARCHAR(120) COLLATE utf8mb4_unicode_ci NOT NULL,
    difficulty ENUM('introductory','beginner','intermediate')
        NOT NULL DEFAULT 'introductory',
    estimated_minutes SMALLINT UNSIGNED DEFAULT NULL,
    publication_status ENUM('draft','published','archived')
        NOT NULL DEFAULT 'draft',
    created_by_admin_id BIGINT UNSIGNED DEFAULT NULL,
    updated_by_admin_id BIGINT UNSIGNED DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_learning_module_slug (slug),
    KEY idx_learning_module_publication (publication_status, skill_category),
    CONSTRAINT fk_learning_module_creator
        FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id)
        ON DELETE SET NULL ON UPDATE RESTRICT,
    CONSTRAINT fk_learning_module_updater
        FOREIGN KEY (updated_by_admin_id) REFERENCES admin_users(id)
        ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_exercises (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    module_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(180) COLLATE utf8mb4_unicode_ci NOT NULL,
    instructions MEDIUMTEXT COLLATE utf8mb4_unicode_ci NOT NULL,
    simulated_materials JSON DEFAULT NULL,
    expected_outcome TEXT COLLATE utf8mb4_unicode_ci NOT NULL,
    review_criteria JSON NOT NULL,
    sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_learning_exercise_order (module_id, sort_order),
    CONSTRAINT fk_learning_exercise_module
        FOREIGN KEY (module_id) REFERENCES learning_modules(id)
        ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_enrollments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    participant_id BIGINT UNSIGNED NOT NULL,
    module_id BIGINT UNSIGNED NOT NULL,
    enrollment_status ENUM('not_started','in_progress','completed')
        NOT NULL DEFAULT 'not_started',
    enrolled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_learning_enrollment (participant_id, module_id),
    CONSTRAINT fk_learning_enrollment_participant
        FOREIGN KEY (participant_id) REFERENCES participant_accounts(id)
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_learning_enrollment_module
        FOREIGN KEY (module_id) REFERENCES learning_modules(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exercise_submissions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    exercise_id BIGINT UNSIGNED NOT NULL,
    participant_id BIGINT UNSIGNED NOT NULL,
    response_text MEDIUMTEXT COLLATE utf8mb4_unicode_ci NOT NULL,
    resource_url VARCHAR(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    review_status ENUM(
        'submitted','under_review','revision_requested','accepted','rejected'
    ) NOT NULL DEFAULT 'submitted',
    feedback MEDIUMTEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    reviewed_by_admin_id BIGINT UNSIGNED DEFAULT NULL,
    reviewed_at DATETIME DEFAULT NULL,
    submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_exercise_submission_participant (participant_id, submitted_at),
    KEY idx_exercise_submission_review (review_status, submitted_at),
    CONSTRAINT fk_exercise_submission_exercise
        FOREIGN KEY (exercise_id) REFERENCES learning_exercises(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_exercise_submission_participant
        FOREIGN KEY (participant_id) REFERENCES participant_accounts(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_exercise_submission_reviewer
        FOREIGN KEY (reviewed_by_admin_id) REFERENCES admin_users(id)
        ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version, description)
VALUES (
    '013_pilot_participants_and_learning',
    'Add pilot sites, participant identities, talent profiles and learning workflows'
);
