# Digital Youth Mini-App

A business diagnostic submission backend with MySQL persistence, administrator authentication, submission review, and audit history.

> **Project status:** Backend core implemented and tested. The frontend has not been implemented. Production hosting and infrastructure have not yet been configured.

## Technology

- Node.js 20+
- TypeScript
- Express 5
- MySQL 8 and `mysql2`
- Zod request validation
- Argon2id password hashing
- Database-backed administrator sessions
- Helmet, CORS, and Express Rate Limit
- Node.js test runner and Supertest

## Repository structure

```text
digital-youth-mini-app/
├── backend/
│   ├── src/
│   │   ├── config/          # Environment and MySQL pool
│   │   ├── middleware/      # Administrator session and CSRF checks
│   │   ├── routes/          # Health, submissions, auth, admin APIs
│   │   ├── schemas/         # Zod request schemas
│   │   ├── scripts/         # Migration and admin bootstrap scripts
│   │   └── services/        # Database and authentication services
│   ├── tests/
│   │   ├── integration/     # MySQL-backed API tests
│   │   └── diagnosticSubmission.schema.test.ts
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── docs/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_submission_status_history.sql
│       └── 003_admin_authentication.sql
├── frontend/                # Reserved for the frontend phase
├── API_DOCUMENTATION.md
├── README.md
└── .gitignore
```

## Prerequisites

- Node.js 20 or newer and npm
- MySQL 8 or newer
- Separate MySQL databases for development and integration tests

## Backend setup

Open PowerShell in the repository root, then:

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Edit `backend/.env` with your local settings. Required application variables:

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development`, `test`, or `production` |
| `PORT` | API port (default: `4000`) |
| `CORS_ORIGINS` | Comma-separated allowed browser origins |
| `DB_HOST` | MySQL hostname |
| `DB_PORT` | MySQL port (default: `3306`) |
| `DB_NAME` | Development database name |
| `DB_USER` | Application database account |
| `DB_PASSWORD` | Application database password |
| `DB_CONNECTION_LIMIT` | MySQL pool connection limit |

The migration runner uses separate `MIGRATION_DB_*` settings. Use a migration account with the schema privileges required by the SQL migrations. Keep the runtime application account restricted to the permissions it needs.

Do not commit `.env`, `.env.test`, database passwords, administrator passwords, session tokens, or other secrets.

## Database and migrations

The development database used by this project is `digital_youth_mini_app`. Integration tests use the separate `digital_youth_mini_app_test` database.

Apply development migrations from `backend/`:

```powershell
npm run db:migrate
```

The migration runner records applied versions in `schema_migrations` and skips versions already applied. The migrations are:

| Migration | Purpose |
|---|---|
| `001_initial_schema` | Initial diagnostic-submission schema |
| `002_submission_status_history` | Status-change audit history |
| `003_admin_authentication` | Administrator users and sessions |

Before running integration tests, configure `backend/.env.test` for `NODE_ENV=test` and the dedicated test database, then apply the migrations to that database using the migration configuration. Never point integration-test cleanup at the development database.

## Create an administrator

After applying the development migrations, create the first administrator from `backend/`:

```powershell
$securePassword = Read-Host "Enter administrator password" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
    $env:ADMIN_BOOTSTRAP_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    npm run admin:create
    if ($LASTEXITCODE -ne 0) { throw "Administrator creation failed." }
}
finally {
    Remove-Item Env:\ADMIN_BOOTSTRAP_PASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    $securePassword.Dispose()
}
```

The script prompts for the administrator email and display name. Use a unique, strong password. Passwords are stored as Argon2id hashes; the plaintext password is not stored.

## Run the API

Development server:

```powershell
npm run dev
```

Default local API base URL: `http://localhost:4000`.

Build and run the compiled server:

```powershell
npm run build
npm start
```

## API overview

See [`API_DOCUMENTATION.md`](API_DOCUMENTATION.md) for request bodies, response formats, validation rules, and status codes.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | API health |
| `GET` | `/api/health/db` | Database connectivity |
| `POST` | `/api/diagnostic-submissions` | Submit a business diagnostic |
| `POST` | `/api/auth/login` | Administrator login |
| `GET` | `/api/auth/me` | Current administrator session |
| `GET` | `/api/auth/csrf` | Rotate the session CSRF token |
| `POST` | `/api/auth/logout` | Revoke the current session |
| `GET` | `/api/admin/submissions` | Paginated submission listing |
| `GET` | `/api/admin/submissions/:id` | Retrieve one submission |
| `GET` | `/api/admin/submissions/:id/history` | Retrieve submission audit history |
| `PATCH` | `/api/admin/submissions/:id/status` | Update review status |

Administrator endpoints use the `dy_admin_session` HttpOnly cookie. State-changing administrator requests require the `x-csrf-token` header. Browser clients must send credentials with authenticated cross-origin requests, and their origin must be included in `CORS_ORIGINS`.

## Submission and review behavior

Diagnostic submissions capture the pilot location, participant and business details, current tools, operational pain, pain frequency, willingness to pay, optional budget, and follow-up consent. Contact details are stored only when follow-up consent is granted.

Review statuses are:

- `new`
- `reviewed`
- `qualified`
- `not_qualified`
- `follow_up`

Submission creation and its initial audit entry are committed in one transaction. Status changes and their audit entries are also committed together. Repeating the current status does not create a duplicate history entry.

## Security controls

The backend currently includes:

- Helmet security headers and an explicit CORS origin allowlist
- JSON request-body size limit
- General API and administrator-login rate limits
- Zod validation and parameterized SQL queries
- Restricted application database credentials and separate migration credentials
- Argon2id administrator password hashing
- Database-backed sessions with hashed session and CSRF tokens
- HttpOnly session cookies with an eight-hour lifetime
- CSRF checks on state-changing administrator endpoints
- Production configuration validation requiring explicit HTTPS CORS origins

Production deployment still requires real production environment values, HTTPS hosting/reverse-proxy configuration, database provisioning, backups, monitoring, and secret management. These are not configured by this repository's local development setup.

## Tests and quality checks

Run from `backend/`:

```powershell
npm run typecheck
npm run build
npm run test:unit
npm run test:integration
npm test
npm audit --audit-level=high
```

The integration suite uses `.env.test` and the isolated `digital_youth_mini_app_test` database. Its setup creates a temporary test administrator and cleans up its own test data. Do not use the development database for integration tests.

## Current scope and next phase

The backend API, database migrations, administrator authentication, administrative review endpoints, documentation, and automated tests are implemented. The `frontend/` directory is reserved for the next phase. Production deployment and infrastructure setup remain outstanding.
