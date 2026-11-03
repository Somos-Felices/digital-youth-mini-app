CREATE TABLE IF NOT EXISTS admin_users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    email VARCHAR(254) COLLATE utf8mb4_unicode_ci NOT NULL,

    display_name VARCHAR(120) COLLATE utf8mb4_unicode_ci NOT NULL,

    password_hash VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,

    is_active TINYINT(1) NOT NULL DEFAULT 1,

    last_login_at TIMESTAMP NULL DEFAULT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_admin_users_email (email)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS admin_sessions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    admin_user_id BIGINT UNSIGNED NOT NULL,

    session_token_hash CHAR(64)
        CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

    csrf_token_hash CHAR(64)
        CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

    expires_at DATETIME NOT NULL,

    last_used_at DATETIME DEFAULT NULL,

    revoked_at DATETIME DEFAULT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_admin_sessions_token (session_token_hash),

    KEY idx_admin_sessions_user_expiry (
        admin_user_id,
        expires_at
    ),

    KEY idx_admin_sessions_expiry (expires_at),

    CONSTRAINT fk_admin_sessions_user
        FOREIGN KEY (admin_user_id)
        REFERENCES admin_users(id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


INSERT IGNORE INTO schema_migrations (
    version,
    description
)
VALUES (
    '003_admin_authentication',
    'Create administrator accounts and secure sessions'
);
