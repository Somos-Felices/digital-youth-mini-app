CREATE TABLE IF NOT EXISTS participant_learning_time_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    participant_id BIGINT UNSIGNED NOT NULL,
    module_id BIGINT UNSIGNED NULL,
    exercise_id BIGINT UNSIGNED NULL,
    work_date DATE NOT NULL,
    minutes_spent SMALLINT UNSIGNED NOT NULL,
    activity_type ENUM('training', 'practice') NOT NULL,
    description TEXT NOT NULL,
    approval_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    reviewed_by_admin_id BIGINT UNSIGNED NULL,
    reviewed_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_learning_time_participant_date (participant_id, work_date),
    KEY ix_learning_time_review (approval_status, created_at),
    CONSTRAINT fk_learning_time_participant
        FOREIGN KEY (participant_id) REFERENCES participant_accounts(id),
    CONSTRAINT fk_learning_time_module
        FOREIGN KEY (module_id) REFERENCES learning_modules(id),
    CONSTRAINT fk_learning_time_exercise
        FOREIGN KEY (exercise_id) REFERENCES learning_exercises(id),
    CONSTRAINT fk_learning_time_reviewer
        FOREIGN KEY (reviewed_by_admin_id) REFERENCES admin_users(id),
    CONSTRAINT ck_learning_time_minutes
        CHECK (minutes_spent > 0 AND minutes_spent <= 1440),
    CONSTRAINT ck_learning_time_exercise_module
        CHECK (exercise_id IS NULL OR module_id IS NOT NULL),
    CONSTRAINT ck_learning_time_review
        CHECK (
            (approval_status = 'pending'
                AND reviewed_by_admin_id IS NULL
                AND reviewed_at IS NULL)
            OR
            (approval_status IN ('approved', 'rejected')
                AND reviewed_by_admin_id IS NOT NULL
                AND reviewed_at IS NOT NULL)
        )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS digital_youth_project_status_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    project_id BIGINT UNSIGNED NOT NULL,
    previous_status ENUM(
        'proposed', 'demonstration', 'business_review', 'agreement_pending',
        'agreed', 'in_progress', 'delivered', 'business_verification',
        'completed', 'correction_requested', 'disputed', 'cancelled'
    ) NULL,
    new_status ENUM(
        'proposed', 'demonstration', 'business_review', 'agreement_pending',
        'agreed', 'in_progress', 'delivered', 'business_verification',
        'completed', 'correction_requested', 'disputed', 'cancelled'
    ) NOT NULL,
    actor_type ENUM('admin', 'participant', 'business', 'system') NOT NULL,
    admin_user_id BIGINT UNSIGNED NULL,
    participant_id BIGINT UNSIGNED NULL,
    business_review_token_id BIGINT UNSIGNED NULL,
    reason VARCHAR(1000) NOT NULL,
    event_metadata JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_project_status_history (project_id, created_at, id),
    KEY ix_project_status_actor (actor_type, created_at),
    CONSTRAINT fk_project_history_project
        FOREIGN KEY (project_id) REFERENCES digital_youth_projects(id),
    CONSTRAINT fk_project_history_admin
        FOREIGN KEY (admin_user_id) REFERENCES admin_users(id),
    CONSTRAINT fk_project_history_participant
        FOREIGN KEY (participant_id) REFERENCES participant_accounts(id),
    CONSTRAINT fk_project_history_business_token
        FOREIGN KEY (business_review_token_id) REFERENCES business_review_tokens(id),
    CONSTRAINT ck_project_history_actor
        CHECK (
            (actor_type = 'admin'
                AND admin_user_id IS NOT NULL
                AND participant_id IS NULL
                AND business_review_token_id IS NULL)
            OR
            (actor_type = 'participant'
                AND participant_id IS NOT NULL
                AND admin_user_id IS NULL
                AND business_review_token_id IS NULL)
            OR
            (actor_type = 'business'
                AND business_review_token_id IS NOT NULL
                AND admin_user_id IS NULL
                AND participant_id IS NULL)
            OR
            (actor_type = 'system'
                AND admin_user_id IS NULL
                AND participant_id IS NULL
                AND business_review_token_id IS NULL)
        )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS project_payment_allocations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    project_payment_id BIGINT UNSIGNED NOT NULL,
    participant_id BIGINT UNSIGNED NOT NULL,
    allocation_amount DECIMAL(12,2) NOT NULL,
    currency CHAR(3) NOT NULL,
    allocation_status ENUM('allocated', 'paid', 'disputed', 'cancelled') NOT NULL DEFAULT 'allocated',
    payout_method ENUM('bank_transfer', 'upi', 'cash', 'other') NULL,
    payout_reference VARCHAR(180) NULL,
    payout_evidence_url VARCHAR(1000) NULL,
    payout_date DATE NULL,
    recorded_by_admin_id BIGINT UNSIGNED NOT NULL,
    verified_by_admin_id BIGINT UNSIGNED NULL,
    verified_at DATETIME NULL,
    notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_payment_participant_allocation (project_payment_id, participant_id),
    KEY ix_payment_allocation_participant (participant_id, allocation_status),
    KEY ix_payment_allocation_status (allocation_status, created_at),
    CONSTRAINT fk_payment_allocation_payment
        FOREIGN KEY (project_payment_id) REFERENCES project_payments(id),
    CONSTRAINT fk_payment_allocation_participant
        FOREIGN KEY (participant_id) REFERENCES participant_accounts(id),
    CONSTRAINT fk_payment_allocation_recorder
        FOREIGN KEY (recorded_by_admin_id) REFERENCES admin_users(id),
    CONSTRAINT fk_payment_allocation_verifier
        FOREIGN KEY (verified_by_admin_id) REFERENCES admin_users(id),
    CONSTRAINT ck_payment_allocation_amount
        CHECK (allocation_amount > 0),
    CONSTRAINT ck_payment_allocation_currency
        CHECK (currency IN ('IDR', 'INR')),
    CONSTRAINT ck_payment_allocation_paid_proof
        CHECK (
            allocation_status <> 'paid'
            OR (
                payout_method IS NOT NULL
                AND payout_date IS NOT NULL
                AND verified_by_admin_id IS NOT NULL
                AND verified_at IS NOT NULL
            )
        )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
