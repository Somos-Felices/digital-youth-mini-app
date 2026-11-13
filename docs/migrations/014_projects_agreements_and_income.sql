-- Digital Youth operational workflows.
-- Additive migration. Migrations 001-013 remain unchanged.

CREATE TABLE IF NOT EXISTS diagnostic_prioritisations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    diagnostic_submission_id BIGINT UNSIGNED NOT NULL,
    usefulness TINYINT(1) NOT NULL,
    solvable TINYINT(1) NOT NULL,
    safe_to_deliver TINYINT(1) NOT NULL,
    measurable TINYINT(1) NOT NULL,
    skills_available TINYINT(1) NOT NULL,
    decision ENUM('prioritised','deferred','rejected') NOT NULL,
    rationale TEXT NOT NULL,
    assessed_by_admin_id BIGINT UNSIGNED NOT NULL,
    assessed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_diagnostic_prioritisation (diagnostic_submission_id),
    KEY idx_prioritisation_decision (decision, assessed_at),
    CONSTRAINT fk_prioritisation_diagnostic
        FOREIGN KEY (diagnostic_submission_id)
        REFERENCES field_visit_diagnostic_submissions(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_prioritisation_admin
        FOREIGN KEY (assessed_by_admin_id) REFERENCES admin_users(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT ck_prioritisation_flags CHECK (
        usefulness IN (0,1) AND solvable IN (0,1)
        AND safe_to_deliver IN (0,1) AND measurable IN (0,1)
        AND skills_available IN (0,1)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS participant_teams (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    pilot_site_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(140) NOT NULL,
    description TEXT DEFAULT NULL,
    team_status ENUM('active','archived') NOT NULL DEFAULT 'active',
    created_by_admin_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_participant_teams_site (pilot_site_id, team_status),
    CONSTRAINT fk_team_site FOREIGN KEY (pilot_site_id)
        REFERENCES pilot_sites(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_team_creator FOREIGN KEY (created_by_admin_id)
        REFERENCES admin_users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS participant_team_members (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    team_id BIGINT UNSIGNED NOT NULL,
    participant_id BIGINT UNSIGNED NOT NULL,
    team_role VARCHAR(100) NOT NULL DEFAULT 'member',
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    left_at DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_team_member_join (team_id, participant_id),
    KEY idx_team_member_participant (participant_id, left_at),
    CONSTRAINT fk_team_member_team FOREIGN KEY (team_id)
        REFERENCES participant_teams(id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_team_member_participant FOREIGN KEY (participant_id)
        REFERENCES participant_accounts(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS business_review_tokens (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    diagnostic_submission_id BIGINT UNSIGNED NOT NULL,
    project_id BIGINT UNSIGNED DEFAULT NULL,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    expires_at DATETIME NOT NULL,
    last_used_at DATETIME DEFAULT NULL,
    revoked_at DATETIME DEFAULT NULL,
    created_by_admin_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_business_review_token_hash (token_hash),
    KEY idx_business_review_token_diagnostic (diagnostic_submission_id, expires_at),
    CONSTRAINT fk_business_review_diagnostic FOREIGN KEY (diagnostic_submission_id)
        REFERENCES field_visit_diagnostic_submissions(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_business_review_creator FOREIGN KEY (created_by_admin_id)
        REFERENCES admin_users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS digital_youth_projects (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    project_code VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    pilot_site_id BIGINT UNSIGNED NOT NULL,
    diagnostic_submission_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(180) NOT NULL,
    objective TEXT NOT NULL,
    proposed_solution TEXT NOT NULL,
    risk_notes TEXT DEFAULT NULL,
    project_status ENUM(
        'proposed','demonstration','business_review','agreement_pending',
        'agreed','in_progress','delivered','business_verification',
        'completed','correction_requested','disputed','cancelled'
    ) NOT NULL DEFAULT 'proposed',
    target_completion_date DATE DEFAULT NULL,
    created_by_admin_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_digital_youth_project_code (project_code),
    KEY idx_projects_site_status (pilot_site_id, project_status, created_at),
    KEY idx_projects_diagnostic (diagnostic_submission_id),
    CONSTRAINT fk_project_site FOREIGN KEY (pilot_site_id)
        REFERENCES pilot_sites(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_project_diagnostic FOREIGN KEY (diagnostic_submission_id)
        REFERENCES field_visit_diagnostic_submissions(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_project_creator FOREIGN KEY (created_by_admin_id)
        REFERENCES admin_users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_participants (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    project_id BIGINT UNSIGNED NOT NULL,
    participant_id BIGINT UNSIGNED DEFAULT NULL,
    team_id BIGINT UNSIGNED DEFAULT NULL,
    assignment_role VARCHAR(120) NOT NULL DEFAULT 'contributor',
    assignment_status ENUM('invited','accepted','active','declined','removed')
        NOT NULL DEFAULT 'invited',
    assigned_by_admin_id BIGINT UNSIGNED NOT NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_at DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_project_assignment_project (project_id, assignment_status),
    KEY idx_project_assignment_participant (participant_id, assignment_status),
    KEY idx_project_assignment_team (team_id, assignment_status),
    CONSTRAINT ck_project_assignment_target CHECK (
        (participant_id IS NOT NULL AND team_id IS NULL)
        OR (participant_id IS NULL AND team_id IS NOT NULL)
    ),
    CONSTRAINT fk_assignment_project FOREIGN KEY (project_id)
        REFERENCES digital_youth_projects(id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_assignment_participant FOREIGN KEY (participant_id)
        REFERENCES participant_accounts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_assignment_team FOREIGN KEY (team_id)
        REFERENCES participant_teams(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_assignment_admin FOREIGN KEY (assigned_by_admin_id)
        REFERENCES admin_users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_tasks (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    project_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    task_status ENUM('todo','in_progress','blocked','submitted','completed')
        NOT NULL DEFAULT 'todo',
    assigned_participant_id BIGINT UNSIGNED DEFAULT NULL,
    due_date DATE DEFAULT NULL,
    completed_at DATETIME DEFAULT NULL,
    created_by_admin_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_project_tasks_project (project_id, task_status, due_date),
    KEY idx_project_tasks_assignee (assigned_participant_id, task_status),
    CONSTRAINT fk_task_project FOREIGN KEY (project_id)
        REFERENCES digital_youth_projects(id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_task_assignee FOREIGN KEY (assigned_participant_id)
        REFERENCES participant_accounts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_task_creator FOREIGN KEY (created_by_admin_id)
        REFERENCES admin_users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_agreements (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    project_id BIGINT UNSIGNED NOT NULL,
    version_number SMALLINT UNSIGNED NOT NULL,
    scope_of_work MEDIUMTEXT NOT NULL,
    deliverables JSON NOT NULL,
    price DECIMAL(12,2) NOT NULL,
    currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    deadline DATE NOT NULL,
    acceptance_criteria MEDIUMTEXT NOT NULL,
    responsible_payer VARCHAR(180) NOT NULL,
    payment_terms TEXT DEFAULT NULL,
    agreement_status ENUM('draft','pending_approval','approved','superseded','withdrawn')
        NOT NULL DEFAULT 'draft',
    created_by_admin_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_project_agreement_version (project_id, version_number),
    KEY idx_project_agreement_status (agreement_status, created_at),
    CONSTRAINT ck_project_agreement_price CHECK (price >= 0),
    CONSTRAINT ck_project_agreement_currency CHECK (currency IN ('IDR','INR')),
    CONSTRAINT fk_agreement_project FOREIGN KEY (project_id)
        REFERENCES digital_youth_projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_agreement_creator FOREIGN KEY (created_by_admin_id)
        REFERENCES admin_users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_agreement_approvals (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    agreement_id BIGINT UNSIGNED NOT NULL,
    approver_type ENUM('business','participant','coordinator') NOT NULL,
    participant_id BIGINT UNSIGNED DEFAULT NULL,
    business_review_token_id BIGINT UNSIGNED DEFAULT NULL,
    admin_user_id BIGINT UNSIGNED DEFAULT NULL,
    decision ENUM('approved','rejected','changes_requested') NOT NULL,
    comments TEXT DEFAULT NULL,
    decided_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_agreement_approvals (agreement_id, approver_type, decided_at),
    CONSTRAINT ck_agreement_approver CHECK (
        (approver_type = 'business' AND business_review_token_id IS NOT NULL
            AND participant_id IS NULL AND admin_user_id IS NULL)
        OR
        (approver_type = 'participant' AND participant_id IS NOT NULL
            AND business_review_token_id IS NULL AND admin_user_id IS NULL)
        OR
        (approver_type = 'coordinator' AND admin_user_id IS NOT NULL
            AND participant_id IS NULL AND business_review_token_id IS NULL)
    ),
    CONSTRAINT fk_agreement_approval_agreement FOREIGN KEY (agreement_id)
        REFERENCES project_agreements(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_agreement_approval_participant FOREIGN KEY (participant_id)
        REFERENCES participant_accounts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_agreement_approval_business_token FOREIGN KEY (business_review_token_id)
        REFERENCES business_review_tokens(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_agreement_approval_admin FOREIGN KEY (admin_user_id)
        REFERENCES admin_users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE business_review_tokens
    ADD CONSTRAINT fk_business_review_project
    FOREIGN KEY (project_id) REFERENCES digital_youth_projects(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE IF NOT EXISTS project_deliverables (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    project_id BIGINT UNSIGNED NOT NULL,
    task_id BIGINT UNSIGNED DEFAULT NULL,
    submitted_by_participant_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    resource_url VARCHAR(1000) DEFAULT NULL,
    evidence_notes TEXT DEFAULT NULL,
    delivery_status ENUM('submitted','under_review','accepted','revision_requested')
        NOT NULL DEFAULT 'submitted',
    submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_deliverables_project (project_id, delivery_status, submitted_at),
    CONSTRAINT fk_deliverable_project FOREIGN KEY (project_id)
        REFERENCES digital_youth_projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_deliverable_task FOREIGN KEY (task_id)
        REFERENCES project_tasks(id) ON DELETE SET NULL ON UPDATE RESTRICT,
    CONSTRAINT fk_deliverable_participant FOREIGN KEY (submitted_by_participant_id)
        REFERENCES participant_accounts(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_verification_reviews (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    project_id BIGINT UNSIGNED NOT NULL,
    deliverable_id BIGINT UNSIGNED DEFAULT NULL,
    reviewer_type ENUM('business','coordinator') NOT NULL,
    business_review_token_id BIGINT UNSIGNED DEFAULT NULL,
    reviewed_by_admin_id BIGINT UNSIGNED DEFAULT NULL,
    decision ENUM('accepted','revision_requested','disputed') NOT NULL,
    feedback MEDIUMTEXT NOT NULL,
    reviewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_project_verification (project_id, decision, reviewed_at),
    CONSTRAINT ck_project_verification_reviewer CHECK (
        (reviewer_type = 'business' AND business_review_token_id IS NOT NULL
            AND reviewed_by_admin_id IS NULL)
        OR
        (reviewer_type = 'coordinator' AND reviewed_by_admin_id IS NOT NULL
            AND business_review_token_id IS NULL)
    ),
    CONSTRAINT fk_verification_project FOREIGN KEY (project_id)
        REFERENCES digital_youth_projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_verification_deliverable FOREIGN KEY (deliverable_id)
        REFERENCES project_deliverables(id) ON DELETE SET NULL ON UPDATE RESTRICT,
    CONSTRAINT fk_verification_business_token FOREIGN KEY (business_review_token_id)
        REFERENCES business_review_tokens(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_verification_admin FOREIGN KEY (reviewed_by_admin_id)
        REFERENCES admin_users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_disputes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    project_id BIGINT UNSIGNED NOT NULL,
    raised_by_type ENUM('business','participant','coordinator') NOT NULL,
    raised_by_participant_id BIGINT UNSIGNED DEFAULT NULL,
    business_review_token_id BIGINT UNSIGNED DEFAULT NULL,
    raised_by_admin_id BIGINT UNSIGNED DEFAULT NULL,
    reason TEXT NOT NULL,
    resolution_status ENUM('open','investigating','resolved','closed')
        NOT NULL DEFAULT 'open',
    resolution_notes MEDIUMTEXT DEFAULT NULL,
    resolved_by_admin_id BIGINT UNSIGNED DEFAULT NULL,
    resolved_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_project_disputes_status (resolution_status, created_at),
    CONSTRAINT fk_dispute_project FOREIGN KEY (project_id)
        REFERENCES digital_youth_projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_dispute_participant FOREIGN KEY (raised_by_participant_id)
        REFERENCES participant_accounts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_dispute_business_token FOREIGN KEY (business_review_token_id)
        REFERENCES business_review_tokens(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_dispute_admin FOREIGN KEY (raised_by_admin_id)
        REFERENCES admin_users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_dispute_resolver FOREIGN KEY (resolved_by_admin_id)
        REFERENCES admin_users(id) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_work_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    project_id BIGINT UNSIGNED NOT NULL,
    participant_id BIGINT UNSIGNED NOT NULL,
    work_date DATE NOT NULL,
    minutes_worked SMALLINT UNSIGNED NOT NULL,
    work_type ENUM('training','practice','demonstration','commercial')
        NOT NULL,
    description TEXT NOT NULL,
    approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    approved_by_admin_id BIGINT UNSIGNED DEFAULT NULL,
    approved_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_work_logs_participant_date (participant_id, work_date),
    KEY idx_work_logs_project_status (project_id, approval_status, work_type),
    CONSTRAINT ck_work_log_minutes CHECK (minutes_worked > 0 AND minutes_worked <= 1440),
    CONSTRAINT fk_work_log_project FOREIGN KEY (project_id)
        REFERENCES digital_youth_projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_work_log_participant FOREIGN KEY (participant_id)
        REFERENCES participant_accounts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_work_log_approver FOREIGN KEY (approved_by_admin_id)
        REFERENCES admin_users(id) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_payments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    project_id BIGINT UNSIGNED NOT NULL,
    agreement_id BIGINT UNSIGNED NOT NULL,
    payer_name VARCHAR(180) NOT NULL,
    recipient_description VARCHAR(255) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    payment_status ENUM('pending','received','disputed','refunded')
        NOT NULL DEFAULT 'pending',
    payment_reference VARCHAR(180) DEFAULT NULL,
    payment_evidence_url VARCHAR(1000) DEFAULT NULL,
    payment_date DATE DEFAULT NULL,
    recorded_by_admin_id BIGINT UNSIGNED NOT NULL,
    verified_by_admin_id BIGINT UNSIGNED DEFAULT NULL,
    verified_at DATETIME DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_project_payment_project (project_id, payment_status, payment_date),
    KEY idx_project_payment_agreement (agreement_id),
    CONSTRAINT ck_project_payment_amount CHECK (amount >= 0),
    CONSTRAINT ck_project_payment_currency CHECK (currency IN ('IDR','INR')),
    CONSTRAINT ck_project_payment_verification CHECK (
        (payment_status = 'received' AND verified_by_admin_id IS NOT NULL
            AND verified_at IS NOT NULL AND payment_date IS NOT NULL)
        OR payment_status <> 'received'
    ),
    CONSTRAINT fk_project_payment_project FOREIGN KEY (project_id)
        REFERENCES digital_youth_projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_project_payment_agreement FOREIGN KEY (agreement_id)
        REFERENCES project_agreements(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_project_payment_recorder FOREIGN KEY (recorded_by_admin_id)
        REFERENCES admin_users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_project_payment_verifier FOREIGN KEY (verified_by_admin_id)
        REFERENCES admin_users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS digital_youth_audit_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    actor_type ENUM('admin','participant','business','system') NOT NULL,
    admin_user_id BIGINT UNSIGNED DEFAULT NULL,
    participant_id BIGINT UNSIGNED DEFAULT NULL,
    event_action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id BIGINT UNSIGNED NOT NULL,
    event_metadata JSON DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_digital_youth_audit_entity (entity_type, entity_id, created_at),
    KEY idx_digital_youth_audit_actor (actor_type, admin_user_id, participant_id, created_at),
    CONSTRAINT fk_dy_audit_admin FOREIGN KEY (admin_user_id)
        REFERENCES admin_users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
    CONSTRAINT fk_dy_audit_participant FOREIGN KEY (participant_id)
        REFERENCES participant_accounts(id) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version, description)
VALUES (
    '014_projects_agreements_and_income',
    'Add prioritisation, teams, projects, agreements, delivery, verification, disputes, work logs and payment records'
);
